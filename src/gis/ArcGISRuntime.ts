import type Layer from "@arcgis/core/layers/Layer.js";
import type ArcGISMap from "@arcgis/core/Map.js";
import type Camera from "@arcgis/core/Camera.js";
import { createLayer, finalizeLoadedLayer } from "./layerFactory";
import { profileToSceneQuality } from "../lib/performance";
import { normalizeAttributeValue } from "../lib/attributeTable";
import { buildOrderBy, buildWhereClause, sanitizeQueryOptions } from "../lib/attributeQuery";
import {
  clampScaleToOperationalRange,
  hasOperationalScaleConstraint,
  operationalExtentCenter,
  recommendedActivationScale,
  resolveOperationalScaleRange
} from "../lib/serviceNavigation";
import {
  reconcileServiceRuntimeScale,
  runtimeScaleRangeFromLoadedLayer
} from "../lib/runtimeScale";
import {
  classifyServiceError,
  friendlyServiceError,
  serviceRetryDelayMs,
  serviceRuntimePolicy,
  shouldRetryServiceError,
  sleepRuntime,
  withRuntimeTimeout,
  type ServiceFailureClass
} from "../lib/serviceRuntime";
import {
  planAtomicLayerActivation,
  selectBatchActivationCandidate,
  type AtomicLayerActivationReason
} from "./layerActivationPlanner";
import { layerCoverageTarget, type ExtentLike } from "./layerCoverageWatchdog";
import {
  beginAtomicLayerActivation,
  clearAtomicLayerActivationState,
  endAtomicLayerActivation
} from "./layerActivationState";
import type {
  AttributeQueryOptions,
  AttributeTableResult,
  CameraState,
  IdentifyResult,
  PerformanceProfile,
  SceneTelemetry,
  ServiceDefinition,
  ToolId
} from "../types";

type Removable = { remove(): void };
type MapPointLike = { latitude?: number | null; longitude?: number | null };
type GraphicHit = {
  type: "graphic";
  graphic: {
    attributes?: Record<string, unknown>;
    layer?: { title?: string | null };
  };
  mapPoint?: MapPointLike | null;
};
type SceneHitResult = GraphicHit | { type: string };
type ScenePointerDetail = { x: number; y: number };
type LayerViewLike = {
  layer?: Layer;
  visible?: boolean;
  visibleAtCurrentScale?: boolean;
};
type LayerViewEventDetail = {
  layer?: Layer;
  layerView?: LayerViewLike;
};
type DeferredActivationNavigation = {
  service: ServiceDefinition;
  layer: Layer;
  layerView?: LayerViewLike;
};
type ArcGISSceneElement = HTMLElement & {
  autoDestroyDisabled?: boolean;
  basemap?: string;
  ground?: string;
  viewingMode?: "global" | "local";
  camera?: Camera;
  cameraPosition?: string | number[];
  cameraTilt?: number;
  cameraHeading?: number;
  qualityProfile?: "low" | "medium" | "high";
  environment?: unknown;
  popupDisabled?: boolean;
  map?: ArcGISMap | null;
  scale?: number;
  extent?: ExtentLike | null;
  fatalError?: Error | null;
  componentOnReady?: () => Promise<unknown>;
  viewOnReady?: () => Promise<void>;
  goTo?: (target: unknown, options?: unknown) => Promise<unknown>;
  hitTest?: (target: unknown) => Promise<{ results: SceneHitResult[] }>;
  toMap?: (target: unknown) => MapPointLike | null | undefined;
  takeScreenshot?: (options?: unknown) => Promise<{ dataUrl: string }>;
  tryFatalErrorRecovery?: () => Promise<void>;
  destroy?: () => Promise<void>;
};
type ArcGISComponentElement = HTMLElement & {
  referenceElement?: ArcGISSceneElement | string;
  element?: HTMLElement;
  profiles?: Array<{ type: "ground" }>;
  includeDefaultSources?: boolean;
  locationEnabled?: boolean;
  popupEnabled?: boolean;
  resultGraphicEnabled?: boolean;
  componentOnReady?: () => Promise<unknown>;
  destroy?: () => Promise<void>;
};

export interface GraphicsRecoveryEvent {
  state: "attempting" | "recovered" | "failed";
  message: string;
}

export interface RuntimeCallbacks {
  onIdentify?: (result: IdentifyResult | null) => void;
  onTelemetry?: (telemetry: SceneTelemetry) => void;
  onCamera?: (camera: CameraState) => void;
  onGraphicsRecovery?: (event: GraphicsRecoveryEvent) => void;
}

export interface OperationalNavigationResult {
  moved: boolean;
  reason?: AtomicLayerActivationReason;
  targetScale?: number;
}

export interface LayerLoadResult {
  ok: boolean;
  error?: string;
  durationMs?: number;
  superseded?: boolean;
  attempts?: number;
  recovered?: boolean;
  failureClass?: ServiceFailureClass;
  navigation?: OperationalNavigationResult;
}

export interface LayerActivationBatchOptions {
  navigate?: boolean;
}

const HOME_CAMERA: CameraState = {
  longitude: 32.8542,
  latitude: 39.9208,
  z: 5200,
  heading: 2,
  tilt: 58
};

const LAYER_VIEW_ACTIVATION_WAIT_MS = 720;

export class ArcGISRuntime {
  private map?: ArcGISMap;
  private scene?: ArcGISSceneElement;
  private readonly layers = new Map<string, Layer>();
  private readonly loadingLayers = new Map<string, Promise<LayerLoadResult>>();
  private readonly desiredVisibility = new Map<string, boolean>();
  private readonly activeScaleServices = new Map<string, ServiceDefinition>();
  private readonly runtimeScaleServices = new Map<string, ServiceDefinition>();
  private readonly deferredActivationNavigations = new Map<string, DeferredActivationNavigation>();
  private activeWidget?: ArcGISComponentElement;
  private searchWidget?: ArcGISComponentElement;
  private navigationWidgets: ArcGISComponentElement[] = [];
  private handles: Removable[] = [];
  private callbacks: RuntimeCallbacks = {};
  private cameraTimer = 0;
  private scaleGuardTimer = 0;
  private telemetryFrame = 0;
  private profile: PerformanceProfile;
  private destroyed = false;
  private recoveringGraphics = false;
  private scaleGuardApplying = false;
  private activationGuardDepth = 0;
  private activationBatchDepth = 0;
  private activationBatchNavigate = true;
  private activationNavigationChain: Promise<void> = Promise.resolve();

  constructor(profile: PerformanceProfile) {
    this.profile = profile;
  }

  async initialize(
    container: HTMLDivElement,
    camera = HOME_CAMERA,
    basemap = "hybrid",
    callbacks: RuntimeCallbacks = {}
  ): Promise<void> {
    this.destroyed = false;
    this.callbacks = callbacks;

    const [{ default: config }] = await Promise.all([
      import("@arcgis/core/config.js"),
      import("@arcgis/map-components/components/arcgis-scene")
    ]);
    if (this.destroyed) return;

    config.request.timeout = 60_000;
    container.replaceChildren();

    const scene = document.createElement("arcgis-scene") as unknown as ArcGISSceneElement;
    scene.id = "altyapi-main-scene";
    scene.className = "arcgis-scene-root";
    scene.autoDestroyDisabled = true;
    scene.basemap = basemap;
    scene.ground = "world-elevation";
    scene.viewingMode = "local";
    scene.cameraPosition = `${camera.longitude}, ${camera.latitude}, ${camera.z}`;
    scene.cameraHeading = camera.heading;
    scene.cameraTilt = camera.tilt;
    scene.qualityProfile = profileToSceneQuality(this.profile);
    scene.environment = this.environmentFor(this.profile);
    scene.popupDisabled = true;

    container.append(scene);
    this.scene = scene;
    if (!scene.viewOnReady) throw new Error("ArcGIS Scene bileşeni viewOnReady API'sini sunmuyor.");
    await scene.viewOnReady();

    if (this.destroyed) {
      scene.remove();
      await scene.destroy?.().catch(() => undefined);
      this.scene = undefined;
      this.map = undefined;
      return;
    }

    const map = scene.map ?? undefined;
    if (!map) {
      scene.remove();
      await scene.destroy?.().catch(() => undefined);
      this.scene = undefined;
      throw new Error("ArcGIS Scene bileşeni harita modelini oluşturamadı.");
    }

    this.map = map;
    this.installSceneEvents();
  }

  async mountSearch(container: HTMLDivElement): Promise<void> {
    if (!this.scene || this.destroyed) return;
    this.disposeComponent(this.searchWidget);
    this.searchWidget = undefined;
    container.replaceChildren();

    await import("@arcgis/map-components/components/arcgis-search");
    if (!this.scene || this.destroyed) return;

    const search = this.createConnectedComponent("arcgis-search");
    search.includeDefaultSources = true;
    search.locationEnabled = false;
    search.popupEnabled = false;
    search.resultGraphicEnabled = true;
    search.className = "arcgis-search-component";
    container.append(search);
    await search.componentOnReady?.();
    this.searchWidget = search;
  }

  async mountNavigation(container: HTMLDivElement): Promise<() => void> {
    if (!this.scene || this.destroyed) return () => undefined;
    this.destroyNavigation();
    container.replaceChildren();

    await Promise.all([
      import("@arcgis/map-components/components/arcgis-home"),
      import("@arcgis/map-components/components/arcgis-compass"),
      import("@arcgis/map-components/components/arcgis-locate"),
      import("@arcgis/map-components/components/arcgis-fullscreen")
    ]);
    if (!this.scene || this.destroyed) return () => undefined;

    const widgets = [
      this.createConnectedComponent("arcgis-home"),
      this.createConnectedComponent("arcgis-compass"),
      this.createConnectedComponent("arcgis-locate"),
      this.createConnectedComponent("arcgis-fullscreen", { element: document.documentElement })
    ];
    this.navigationWidgets = widgets;

    for (const widget of widgets) {
      widget.classList.add("arcgis-nav-component");
      container.append(widget);
    }

    return () => {
      for (const widget of widgets) this.disposeComponent(widget);
      if (this.navigationWidgets === widgets) this.navigationWidgets = [];
      container.replaceChildren();
    };
  }

  async setLayerVisible(service: ServiceDefinition, visible: boolean): Promise<LayerLoadResult> {
    if (!this.map || !this.scene || this.destroyed) {
      return { ok: false, error: "Harita motoru henüz hazır değil." };
    }

    this.desiredVisibility.set(service.id, visible);

    if (!visible) {
      this.releaseDeferredActivation(service.id);
      this.setScaleGuard(service, false);
      const existing = this.layers.get(service.id);
      if (existing) existing.visible = false;
      return { ok: true, durationMs: 0 };
    }

    const existingLoad = this.loadingLayers.get(service.id);
    if (existingLoad) {
      const result = await existingLoad;
      if (this.destroyed || this.desiredVisibility.get(service.id) !== true) {
        return { ok: true, durationMs: result.durationMs, superseded: true };
      }
      const loaded = this.layers.get(service.id);
      if (result.ok && loaded) {
        loaded.opacity = clampOpacity(service.opacity);
        loaded.visible = true;
      }
      return result;
    }

    const existing = this.layers.get(service.id);
    if (existing) {
      const navigation = await this.activateLoadedLayer(service, existing, false);
      if (this.destroyed || this.desiredVisibility.get(service.id) !== true) {
        return { ok: true, durationMs: 0, superseded: true, navigation };
      }
      return { ok: true, durationMs: 0, navigation };
    }

    const operation = this.loadLayer(service);
    this.loadingLayers.set(service.id, operation);
    try {
      return await operation;
    } finally {
      if (this.loadingLayers.get(service.id) === operation) this.loadingLayers.delete(service.id);
    }
  }

  /**
   * Groups several layer visibility mutations into one camera transaction. Every
   * layer still loads and contributes its live provider scale/extent metadata,
   * but per-layer goTo calls and the continuous scale guard are held until the
   * outermost batch completes. Bookmark/share restores can opt out of automatic
   * navigation when an explicit camera is authoritative.
   */
  async withLayerActivationBatch<T>(
    task: () => Promise<T>,
    options: LayerActivationBatchOptions = {}
  ): Promise<T> {
    const outermost = this.activationBatchDepth === 0;
    if (outermost) {
      this.activationBatchNavigate = options.navigate !== false;
      for (const serviceId of [...this.deferredActivationNavigations.keys()]) {
        this.releaseDeferredActivation(serviceId);
      }
      this.activationGuardDepth += 1;
      window.clearTimeout(this.scaleGuardTimer);
    } else if (options.navigate === false) {
      this.activationBatchNavigate = false;
    }

    this.activationBatchDepth += 1;
    let completed = false;
    try {
      const result = await task();
      completed = true;
      return result;
    } finally {
      this.activationBatchDepth = Math.max(0, this.activationBatchDepth - 1);
      if (outermost) {
        try {
          if (completed && this.activationBatchNavigate && !this.destroyed) {
            await this.flushDeferredActivationNavigation();
          }
        } finally {
          for (const serviceId of [...this.deferredActivationNavigations.keys()]) {
            this.releaseDeferredActivation(serviceId);
          }
          this.activationBatchNavigate = true;
          this.activationBatchDepth = 0;
          this.activationGuardDepth = Math.max(0, this.activationGuardDepth - 1);
          if (this.activationGuardDepth === 0) this.scheduleScaleGuard();
        }
      }
    }
  }

  setOpacity(serviceId: string, opacity: number): void {
    const layer = this.layers.get(serviceId);
    if (layer) layer.opacity = clampOpacity(opacity);
  }

  /**
   * Applies a stable top-to-bottom draw order to all currently loaded operational
   * layers. Hidden cached layers participate too, so reopening a layer does not
   * silently change the user's visual stack.
   */
  setLayerOrder(serviceIdsTopToBottom: readonly string[]): void {
    const map = this.map;
    if (!map || this.destroyed) return;

    const seen = new Set<string>();
    const ids = [...serviceIdsTopToBottom];
    for (const id of this.layers.keys()) {
      if (!ids.includes(id)) ids.push(id);
    }

    const bottomToTop: Layer[] = [];
    for (let index = ids.length - 1; index >= 0; index -= 1) {
      const id = ids[index];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const layer = this.layers.get(id);
      if (layer) bottomToTop.push(layer);
    }

    bottomToTop.forEach((layer, index) => {
      try {
        map.reorder(layer, index);
      } catch {
        // A layer can disappear from the collection while an async reload finishes.
      }
    });
  }

  async reloadLayer(service: ServiceDefinition): Promise<LayerLoadResult> {
    if (this.destroyed) return { ok: false, error: "Harita oturumu kapatıldı." };

    this.releaseDeferredActivation(service.id);
    this.setScaleGuard(service, false);
    this.runtimeScaleServices.delete(service.id);
    this.desiredVisibility.set(service.id, false);
    const inFlight = this.loadingLayers.get(service.id);
    if (inFlight) await inFlight.catch(() => undefined);

    const existing = this.layers.get(service.id);
    if (existing) {
      this.map?.remove(existing);
      existing.destroy();
      this.layers.delete(service.id);
    }

    this.desiredVisibility.set(service.id, true);
    return this.setLayerVisible(service, true);
  }

  async queryAttributes(
    service: ServiceDefinition,
    options: AttributeQueryOptions = { limit: 100, offset: 0 }
  ): Promise<AttributeTableResult> {
    if (this.destroyed) throw new Error("Harita oturumu kapatıldı.");
    if (service.kind !== "FeatureServer" && service.kind !== "SceneServer") {
      throw new Error("Öznitelik tablosu yalnız FeatureServer ve SceneServer katmanlarında destekleniyor.");
    }

    const safeOptions = sanitizeQueryOptions(options);
    let layer = this.layers.get(service.id);
    let temporary = false;

    if (!layer) {
      layer = await createLayer({ ...service, visible: false });
      temporary = true;
    }

    const queryable = layer as Layer & {
      fields?: Array<{ name: string; alias?: string; type?: string }>;
      objectIdField?: string;
      createQuery?: () => {
        where?: string;
        outFields?: string[];
        returnGeometry?: boolean;
        num?: number;
        start?: number;
        orderByFields?: string[];
      };
      queryFeatures?: (query: unknown) => Promise<{ features?: Array<{ attributes?: Record<string, unknown> }> }>;
      queryFeatureCount?: (query: unknown) => Promise<number>;
    };

    try {
      await withTimeout(layer.load(), 20_000, "Katman sorgu hazırlığı");
      if (!queryable.createQuery || !queryable.queryFeatures) {
        throw new Error("Bu katman tarayıcı üzerinden öznitelik sorgusunu desteklemiyor.");
      }

      const fields = (queryable.fields ?? [])
        .filter((field) => Boolean(field.name))
        .map((field) => ({ name: field.name, alias: field.alias || field.name, type: field.type }));

      const where = buildWhereClause(safeOptions.filter, fields);
      const orderBy = buildOrderBy(safeOptions.orderBy, fields);
      const query = queryable.createQuery();
      query.where = where;
      query.outFields = ["*"];
      query.returnGeometry = false;
      query.start = safeOptions.offset;
      query.num = safeOptions.limit;
      if (orderBy) query.orderByFields = [orderBy];

      const countQuery = queryable.createQuery();
      countQuery.where = where;
      countQuery.returnGeometry = false;

      const [featureSet, total] = await withTimeout(
        Promise.all([
          queryable.queryFeatures(query),
          queryable.queryFeatureCount ? queryable.queryFeatureCount(countQuery) : Promise.resolve(undefined)
        ]),
        25_000,
        "Öznitelik sorgusu"
      );

      const rows = (featureSet.features ?? []).map((feature) =>
        Object.fromEntries(
          Object.entries(feature.attributes ?? {}).map(([key, value]) => [key, normalizeAttributeValue(value)])
        )
      );
      const resolvedTotal = total ?? safeOptions.offset + rows.length;

      return {
        serviceId: service.id,
        serviceName: service.displayName,
        fields,
        rows,
        total: resolvedTotal,
        truncated: resolvedTotal > rows.length,
        objectIdField: queryable.objectIdField,
        fetchedAt: new Date().toISOString(),
        offset: safeOptions.offset,
        limit: safeOptions.limit,
        hasPrevious: safeOptions.offset > 0,
        hasNext: safeOptions.offset + rows.length < resolvedTotal,
        where,
        orderBy
      };
    } finally {
      if (temporary) layer.destroy();
    }
  }

  async zoomToLayer(service: ServiceDefinition): Promise<boolean> {
    if (!this.scene || this.destroyed) return false;
    const scaleService = this.runtimeScaleServices.get(service.id) ?? service;
    try {
      if (scaleService.operationalExtent) {
        const { default: Point } = await import("@arcgis/core/geometry/Point.js");
        if (!this.scene || this.destroyed) return false;
        const center = operationalExtentCenter(scaleService.operationalExtent);
        const target = new Point({
          longitude: center.longitude,
          latitude: center.latitude,
          spatialReference: { wkid: 4326 }
        });
        const scale = recommendedActivationScale(scaleService);
        if (scale) {
          await this.scene.goTo?.({ target, scale }, { duration: 850, easing: "ease-in-out" });
          this.enforceScaleGuard();
          return true;
        }

        const { default: Extent } = await import("@arcgis/core/geometry/Extent.js");
        if (!this.scene || this.destroyed) return false;
        const extent = new Extent({
          xmin: scaleService.operationalExtent.xmin,
          ymin: scaleService.operationalExtent.ymin,
          xmax: scaleService.operationalExtent.xmax,
          ymax: scaleService.operationalExtent.ymax,
          spatialReference: { wkid: 4326 }
        });
        await this.scene.goTo?.(extent.expand(1.08), { duration: 850, easing: "ease-in-out" });
        this.enforceScaleGuard();
        return true;
      }

      const layer = this.layers.get(service.id);
      if (!layer) return false;
      await layer.load();
      const extent = layer.fullExtent;
      if (!extent) return false;
      await this.scene.goTo?.(extent.expand(1.2), { duration: 900, easing: "ease-in-out" });
      this.enforceScaleGuard();
      return true;
    } catch {
      return false;
    }
  }

  setBasemap(basemap: string): void {
    if (this.scene && !this.destroyed) this.scene.basemap = basemap;
  }

  setPerformanceProfile(profile: PerformanceProfile): void {
    this.profile = profile;
    if (!this.scene || this.destroyed) return;
    this.scene.qualityProfile = profileToSceneQuality(profile);
    this.scene.environment = this.environmentFor(profile);
    this.pruneLayerCache();
  }

  async openTool(tool: Exclude<ToolId, null>, container: HTMLDivElement): Promise<void> {
    if (!this.scene || this.destroyed) throw new Error("Harita motoru hazır değil.");
    this.closeTool();
    container.replaceChildren();
    this.activeWidget = await this.createToolWidget(tool, container);
  }

  closeTool(): void {
    this.disposeComponent(this.activeWidget);
    this.activeWidget = undefined;
  }

  async goHome(): Promise<void> {
    await this.goTo(HOME_CAMERA);
  }

  async goTo(camera: CameraState): Promise<void> {
    if (!this.scene || this.destroyed) return;
    const { default: CameraCtor } = await import("@arcgis/core/Camera.js");
    if (!this.scene || this.destroyed) return;
    const target = new CameraCtor({
      position: pointProperties(camera),
      heading: camera.heading,
      tilt: camera.tilt
    });
    await this.scene.goTo?.(target, { duration: 950, easing: "ease-in-out" });
    this.enforceScaleGuard();
    this.scheduleScaleGuard();
  }

  getCamera(): CameraState {
    if (!this.scene || this.destroyed) return HOME_CAMERA;
    const camera = this.scene.camera;
    if (!camera) return HOME_CAMERA;
    return {
      longitude: camera.position.longitude ?? HOME_CAMERA.longitude,
      latitude: camera.position.latitude ?? HOME_CAMERA.latitude,
      z: camera.position.z ?? HOME_CAMERA.z,
      heading: camera.heading ?? HOME_CAMERA.heading,
      tilt: camera.tilt ?? HOME_CAMERA.tilt
    };
  }

  async takeScreenshot(): Promise<string | undefined> {
    if (!this.scene || this.destroyed) return undefined;
    try {
      const result = await this.scene.takeScreenshot?.({
        format: "png",
        width: Math.min(innerWidth * devicePixelRatio, 2400)
      });
      return result?.dataUrl;
    } catch {
      return undefined;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.clearTimeout(this.cameraTimer);
    window.clearTimeout(this.scaleGuardTimer);
    cancelAnimationFrame(this.telemetryFrame);
    this.closeTool();
    this.disposeComponent(this.searchWidget);
    this.searchWidget = undefined;
    this.destroyNavigation();
    for (const handle of this.handles) handle.remove();
    this.handles = [];
    for (const layer of this.layers.values()) layer.destroy();
    this.layers.clear();
    this.loadingLayers.clear();
    this.desiredVisibility.clear();
    this.activeScaleServices.clear();
    this.runtimeScaleServices.clear();
    this.deferredActivationNavigations.clear();
    clearAtomicLayerActivationState();
    this.activationGuardDepth = 0;
    this.activationBatchDepth = 0;
    this.activationBatchNavigate = true;
    this.activationNavigationChain = Promise.resolve();
    this.callbacks = {};
    this.recoveringGraphics = false;
    this.scaleGuardApplying = false;
    const scene = this.scene;
    this.scene = undefined;
    this.map = undefined;
    scene?.remove();
    if (scene?.destroy) void scene.destroy().catch(() => undefined);
  }

  private async loadLayer(service: ServiceDefinition): Promise<LayerLoadResult> {
    const startedAt = performance.now();
    const policy = serviceRuntimePolicy(service);
    let lastError: unknown;
    let attempts = 0;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      attempts = attempt;
      let layer: Layer | undefined;
      try {
        layer = await withRuntimeTimeout(
          createLayer(service),
          policy.createTimeoutMs,
          "Katman bileşeni oluşturma"
        );

        if (this.destroyed) {
          layer.destroy();
          return {
            ok: false,
            error: "Harita oturumu kapatıldı.",
            durationMs: Math.round(performance.now() - startedAt),
            attempts
          };
        }

        if (this.desiredVisibility.get(service.id) !== true) {
          layer.destroy();
          return {
            ok: true,
            durationMs: Math.round(performance.now() - startedAt),
            superseded: true,
            attempts
          };
        }

        // Never attach a half-loaded remote layer to the live map. ArcGIS load()
        // is single-flight, so each retry deliberately creates a fresh Layer instance.
        await withRuntimeTimeout(
          layer.load(),
          policy.loadTimeoutMs,
          "Katman yükleme",
          () => {
            try { layer?.cancelLoad(); } catch { /* cancellation is best-effort */ }
          }
        );
        finalizeLoadedLayer(service, layer);

        if (this.destroyed) {
          layer.destroy();
          return {
            ok: false,
            error: "Harita oturumu kapatıldı.",
            durationMs: Math.round(performance.now() - startedAt),
            attempts
          };
        }

        if (this.desiredVisibility.get(service.id) !== true) {
          layer.destroy();
          return {
            ok: true,
            durationMs: Math.round(performance.now() - startedAt),
            superseded: true,
            attempts
          };
        }

        const navigation = await this.activateLoadedLayer(service, layer, true);
        if (this.destroyed || this.desiredVisibility.get(service.id) !== true) {
          return {
            ok: true,
            durationMs: Math.round(performance.now() - startedAt),
            superseded: true,
            attempts,
            navigation
          };
        }

        this.pruneLayerCache();
        return {
          ok: true,
          durationMs: Math.round(performance.now() - startedAt),
          attempts,
          recovered: attempts > 1,
          navigation
        };
      } catch (error) {
        lastError = error;
        if (layer) {
          try { layer.cancelLoad(); } catch { /* cancellation is best-effort */ }
          this.cleanupLayer(service.id, layer);
        }

        if (this.destroyed) {
          return {
            ok: false,
            error: "Harita oturumu kapatıldı.",
            durationMs: Math.round(performance.now() - startedAt),
            attempts
          };
        }
        if (this.desiredVisibility.get(service.id) !== true) {
          return {
            ok: true,
            durationMs: Math.round(performance.now() - startedAt),
            superseded: true,
            attempts
          };
        }
        if (!shouldRetryServiceError(error, attempt, policy)) break;
        await sleepRuntime(serviceRetryDelayMs(service.id, attempt, policy));
      }
    }

    this.setScaleGuard(service, false);
    return {
      ok: false,
      error: friendlyServiceError(service, lastError),
      durationMs: Math.round(performance.now() - startedAt),
      attempts,
      failureClass: classifyServiceError(lastError)
    };
  }

  private async activateLoadedLayer(
    service: ServiceDefinition,
    layer: Layer,
    attachToMap: boolean
  ): Promise<OperationalNavigationResult> {
    const layerId = layer.id;
    const runtimeScale = runtimeScaleRangeFromLoadedLayer(layer);
    const reconciledService = reconcileServiceRuntimeScale(service, runtimeScale);
    this.runtimeScaleServices.set(service.id, reconciledService);

    beginAtomicLayerActivation(layerId);
    this.activationGuardDepth += 1;
    window.clearTimeout(this.scaleGuardTimer);

    const layerViewPromise = attachToMap
      ? this.waitForLayerViewCreation(layer)
      : Promise.resolve(undefined);

    try {
      // Register the loaded provider range before the one camera decision, but
      // do not let the continuous scale guard move the Scene during activation.
      this.setScaleGuard(reconciledService, true, false);
      layer.opacity = clampOpacity(service.opacity);
      layer.visible = true;
      this.layers.set(service.id, layer);
      if (attachToMap) this.map?.add(layer);

      const layerView = await layerViewPromise;
      if (this.destroyed || this.desiredVisibility.get(service.id) !== true) {
        layer.visible = false;
        this.setScaleGuard(reconciledService, false, false);
        return { moved: false };
      }

      if (this.activationBatchDepth > 0) {
        this.deferActivationNavigation(reconciledService, layer, layerView);
        return { moved: false };
      }

      return await this.queueActivationNavigation(() =>
        this.executeAtomicActivationNavigation(reconciledService, layer, layerView)
      );
    } finally {
      this.activationGuardDepth = Math.max(0, this.activationGuardDepth - 1);
      endAtomicLayerActivation(layerId);
      if (this.activationGuardDepth === 0 && this.activationBatchDepth === 0) this.scheduleScaleGuard();
    }
  }

  private async executeAtomicActivationNavigation(
    service: ServiceDefinition,
    layer: Layer,
    layerView: LayerViewLike | undefined
  ): Promise<OperationalNavigationResult> {
    const scene = this.scene;
    if (!scene || this.destroyed || this.desiredVisibility.get(service.id) !== true) return { moved: false };

    const camera = scene.camera;
    const plan = planAtomicLayerActivation({
      service,
      activeServices: [...this.activeScaleServices.values()],
      currentScale: scene.scale,
      cameraLongitude: camera?.position.longitude ?? undefined,
      cameraLatitude: camera?.position.latitude ?? undefined,
      viewExtent: scene.extent,
      providerExtent: layer.fullExtent as ExtentLike | null | undefined,
      layerViewVisibleAtCurrentScale: layerView?.visibleAtCurrentScale
    });

    if (!plan.moved || !scene.goTo) return { moved: false };

    try {
      let target: unknown;
      const providerExtent = layer.fullExtent as ExtentLike | null | undefined;

      if (plan.focus === "provider-extent" && providerExtent) {
        target = plan.fitProviderExtent
          ? layerCoverageTarget(providerExtent)
          : { target: providerExtent.center ?? providerExtent, scale: plan.targetScale };
      } else if (plan.focus === "operational-center" && service.operationalExtent) {
        if (plan.targetScale) {
          const { default: Point } = await import("@arcgis/core/geometry/Point.js");
          if (!this.scene || this.destroyed) return { moved: false };
          const center = operationalExtentCenter(service.operationalExtent);
          target = {
            target: new Point({
              longitude: center.longitude,
              latitude: center.latitude,
              spatialReference: { wkid: 4326 }
            }),
            scale: plan.targetScale
          };
        } else {
          const { default: Extent } = await import("@arcgis/core/geometry/Extent.js");
          if (!this.scene || this.destroyed) return { moved: false };
          target = new Extent({
            xmin: service.operationalExtent.xmin,
            ymin: service.operationalExtent.ymin,
            xmax: service.operationalExtent.xmax,
            ymax: service.operationalExtent.ymax,
            spatialReference: { wkid: 4326 }
          }).expand(1.08);
        }
      } else if (plan.focus === "current-center" && plan.targetScale) {
        const { default: Point } = await import("@arcgis/core/geometry/Point.js");
        if (!this.scene || this.destroyed) return { moved: false };
        target = {
          target: new Point({
            longitude: camera?.position.longitude ?? HOME_CAMERA.longitude,
            latitude: camera?.position.latitude ?? HOME_CAMERA.latitude,
            spatialReference: { wkid: 4326 }
          }),
          scale: plan.targetScale
        };
      }

      if (!target || !this.scene || this.destroyed || this.desiredVisibility.get(service.id) !== true) {
        return { moved: false };
      }

      await this.scene.goTo?.(target, { duration: 820, easing: "ease-in-out" });
      return { moved: true, reason: plan.reason, targetScale: plan.targetScale };
    } catch {
      return { moved: false };
    }
  }

  private deferActivationNavigation(
    service: ServiceDefinition,
    layer: Layer,
    layerView: LayerViewLike | undefined
  ): void {
    const existing = this.deferredActivationNavigations.get(service.id);
    if (existing && existing.layer.id !== layer.id) {
      endAtomicLayerActivation(existing.layer.id);
    }
    if (!existing || existing.layer.id !== layer.id) {
      // Keep one extra atomic reference after activateLoadedLayer() releases its
      // local reference, so the LayerView watchdog cannot repair scale mid-batch.
      beginAtomicLayerActivation(layer.id);
    }
    this.deferredActivationNavigations.delete(service.id);
    this.deferredActivationNavigations.set(service.id, { service, layer, layerView });
  }

  private releaseDeferredActivation(serviceId: string): void {
    const existing = this.deferredActivationNavigations.get(serviceId);
    if (!existing) return;
    this.deferredActivationNavigations.delete(serviceId);
    endAtomicLayerActivation(existing.layer.id);
  }

  private async flushDeferredActivationNavigation(): Promise<OperationalNavigationResult> {
    const scene = this.scene;
    if (!scene || this.destroyed || this.deferredActivationNavigations.size === 0) return { moved: false };

    const camera = scene.camera;
    const activeServices = [...this.activeScaleServices.values()];
    const planned = [...this.deferredActivationNavigations.values()]
      .filter((candidate) =>
        this.desiredVisibility.get(candidate.service.id) === true && candidate.layer.visible !== false
      )
      .map((candidate) => ({
        value: candidate,
        plan: planAtomicLayerActivation({
          service: candidate.service,
          activeServices,
          currentScale: scene.scale,
          cameraLongitude: camera?.position.longitude ?? undefined,
          cameraLatitude: camera?.position.latitude ?? undefined,
          viewExtent: scene.extent,
          providerExtent: candidate.layer.fullExtent as ExtentLike | null | undefined,
          layerViewVisibleAtCurrentScale: candidate.layerView?.visibleAtCurrentScale
        })
      }));

    const selected = selectBatchActivationCandidate(planned);
    if (!selected) return { moved: false };

    return this.queueActivationNavigation(() =>
      this.executeAtomicActivationNavigation(
        selected.value.service,
        selected.value.layer,
        selected.value.layerView
      )
    );
  }

  private waitForLayerViewCreation(layer: Layer): Promise<LayerViewLike | undefined> {
    if (typeof document === "undefined") return Promise.resolve(undefined);

    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;

      const finish = (layerView?: LayerViewLike) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        document.removeEventListener("arcgisViewLayerviewCreate", onCreate as EventListener);
        document.removeEventListener("arcgisViewLayerviewCreateError", onError as EventListener);
        resolve(layerView);
      };

      const matches = (candidate?: Layer) => candidate === layer || candidate?.id === layer.id;
      const onCreate = (event: Event) => {
        const detail = layerViewDetail(event);
        const layerView = detail?.layerView;
        if (layerView && matches(layerView.layer ?? detail?.layer)) finish(layerView);
      };
      const onError = (event: Event) => {
        const detail = layerViewDetail(event);
        if (matches(detail?.layer ?? detail?.layerView?.layer)) finish();
      };

      document.addEventListener("arcgisViewLayerviewCreate", onCreate as EventListener);
      document.addEventListener("arcgisViewLayerviewCreateError", onError as EventListener);
      timer = window.setTimeout(() => finish(), LAYER_VIEW_ACTIVATION_WAIT_MS);
    });
  }

  private queueActivationNavigation<T>(task: () => Promise<T>): Promise<T> {
    const run = this.activationNavigationChain.then(task, task);
    this.activationNavigationChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private cleanupLayer(serviceId: string, layer: Layer): void {
    this.releaseDeferredActivation(serviceId);
    if (this.layers.get(serviceId) === layer) this.layers.delete(serviceId);
    try {
      this.map?.remove(layer);
    } catch {
      // Layer may already have been detached while an async load was being superseded.
    }
    try {
      layer.destroy();
    } catch {
      // ArcGIS layer destruction is best-effort during cancellation/teardown.
    }
  }

  private setScaleGuard(service: ServiceDefinition, active: boolean, enforce = true): void {
    const scaleService = active ? (this.runtimeScaleServices.get(service.id) ?? service) : service;
    if (!hasOperationalScaleConstraint(scaleService)) {
      this.activeScaleServices.delete(service.id);
      return;
    }

    if (active) {
      // Reinsert so Map iteration preserves most-recent activation priority for impossible intersections.
      this.activeScaleServices.delete(service.id);
      this.activeScaleServices.set(service.id, scaleService);
      if (enforce && this.activationGuardDepth === 0 && this.activationBatchDepth === 0) this.enforceScaleGuard();
    } else {
      this.activeScaleServices.delete(service.id);
    }
    if (enforce && this.activationGuardDepth === 0 && this.activationBatchDepth === 0) this.scheduleScaleGuard();
  }

  private scheduleScaleGuard(): void {
    if (!this.scene || this.destroyed || this.activationBatchDepth > 0) return;
    window.clearTimeout(this.scaleGuardTimer);
    this.scaleGuardTimer = window.setTimeout(() => this.enforceScaleGuard(), 110);
  }

  private enforceScaleGuard(): void {
    const scene = this.scene;
    if (
      !scene ||
      this.destroyed ||
      this.activationGuardDepth > 0 ||
      this.activationBatchDepth > 0 ||
      this.scaleGuardApplying ||
      this.activeScaleServices.size === 0
    ) return;

    const range = resolveOperationalScaleRange([...this.activeScaleServices.values()]);
    const currentScale = scene.scale;
    if (!Number.isFinite(currentScale) || !currentScale || currentScale <= 0) return;
    const targetScale = clampScaleToOperationalRange(currentScale, range);
    if (!Number.isFinite(targetScale) || targetScale <= 0) return;

    const relativeDifference = Math.abs(targetScale - currentScale) / currentScale;
    if (relativeDifference < 0.002) return;

    this.scaleGuardApplying = true;
    scene.scale = targetScale;
    window.setTimeout(() => {
      this.scaleGuardApplying = false;
    }, 90);
  }

  private destroyNavigation(): void {
    for (const widget of this.navigationWidgets) this.disposeComponent(widget);
    this.navigationWidgets = [];
  }

  private createConnectedComponent(tagName: string, properties: Partial<ArcGISComponentElement> = {}): ArcGISComponentElement {
    if (!this.scene) throw new Error("Harita motoru hazır değil.");
    const element = document.createElement(tagName) as ArcGISComponentElement;
    element.referenceElement = this.scene;
    Object.assign(element, properties);
    return element;
  }

  private disposeComponent(component?: ArcGISComponentElement): void {
    if (!component) return;
    component.remove();
    if (component.destroy) void component.destroy().catch(() => undefined);
  }

  private installSceneEvents(): void {
    const scene = this.scene;
    if (!scene) return;

    this.handles.push(
      domHandle(scene, "arcgisViewClick", async (event) => {
        if (!this.scene || this.destroyed || !this.scene.hitTest) return;
        try {
          const detail = event instanceof CustomEvent ? event.detail : undefined;
          const hit = await this.scene.hitTest(detail);
          if (this.destroyed) return;
          const graphicHit = hit.results.find((result): result is GraphicHit => result.type === "graphic");
          if (!graphicHit) {
            this.callbacks.onIdentify?.(null);
            return;
          }
          const graphic = graphicHit.graphic;
          const attributes = Object.entries(graphic.attributes ?? {})
            .filter(([key]) => !key.startsWith("_") && key !== "Shape")
            .slice(0, 40)
            .map(([key, value]) => ({ key, value: formatValue(value) }));
          this.callbacks.onIdentify?.({
            title: graphic.layer?.title ?? "Seçili nesne",
            subtitle: graphicHit.mapPoint ? coordinateLabel(graphicHit.mapPoint) : undefined,
            attributes
          });
        } catch {
          if (!this.destroyed) this.callbacks.onIdentify?.(null);
        }
      })
    );

    this.handles.push(
      domHandle(scene, "arcgisViewPointerMove", (event) => {
        if (!this.scene || this.destroyed || document.hidden || !this.scene.toMap) return;
        const detail = event instanceof CustomEvent ? event.detail as ScenePointerDetail : undefined;
        if (!detail || !Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return;
        cancelAnimationFrame(this.telemetryFrame);
        this.telemetryFrame = requestAnimationFrame(() => {
          if (!this.scene || this.destroyed || !this.scene.toMap) return;
          const point = this.scene.toMap({ x: detail.x, y: detail.y });
          const camera = this.scene.camera;
          this.callbacks.onTelemetry?.({
            latitude: point?.latitude ?? undefined,
            longitude: point?.longitude ?? undefined,
            altitude: camera?.position.z ?? 0,
            tilt: camera?.tilt ?? 0,
            heading: camera?.heading ?? 0,
            scale: this.scene.scale
          });
        });
      })
    );

    this.handles.push(
      domHandle(scene, "arcgisViewChange", () => {
        if (this.destroyed) return;
        this.scheduleScaleGuard();
        window.clearTimeout(this.cameraTimer);
        this.cameraTimer = window.setTimeout(() => {
          if (!this.destroyed) this.callbacks.onCamera?.(this.getCamera());
        }, 350);
      })
    );

    this.handles.push(
      domHandle(scene, "arcgisViewReadyError", () => {
        if (this.destroyed || !this.scene?.fatalError) return;
        void this.recoverGraphics();
      })
    );
  }

  private async createToolWidget(tool: Exclude<ToolId, null>, container: HTMLDivElement): Promise<ArcGISComponentElement> {
    if (!this.scene || this.destroyed) throw new Error("Harita motoru hazır değil.");

    let tagName: string;
    switch (tool) {
      case "legend":
        await import("@arcgis/map-components/components/arcgis-legend");
        tagName = "arcgis-legend";
        break;
      case "basemap":
        await import("@arcgis/map-components/components/arcgis-basemap-gallery");
        tagName = "arcgis-basemap-gallery";
        break;
      case "distance":
        await import("@arcgis/map-components/components/arcgis-direct-line-measurement-3d");
        tagName = "arcgis-direct-line-measurement-3d";
        break;
      case "area":
        await import("@arcgis/map-components/components/arcgis-area-measurement-3d");
        tagName = "arcgis-area-measurement-3d";
        break;
      case "daylight":
        await import("@arcgis/map-components/components/arcgis-daylight");
        tagName = "arcgis-daylight";
        break;
      case "slice":
        await import("@arcgis/map-components/components/arcgis-slice");
        tagName = "arcgis-slice";
        break;
      case "lineOfSight":
        await import("@arcgis/map-components/components/arcgis-line-of-sight");
        tagName = "arcgis-line-of-sight";
        break;
      case "elevation":
        await import("@arcgis/map-components/components/arcgis-elevation-profile");
        tagName = "arcgis-elevation-profile";
        break;
    }

    if (!this.scene || this.destroyed) throw new Error("Harita motoru hazır değil.");
    const component = this.createConnectedComponent(tagName);
    if (tool === "elevation") component.profiles = [{ type: "ground" }];
    component.classList.add("arcgis-tool-component");
    container.append(component);
    await component.componentOnReady?.();
    return component;
  }

  async recoverGraphics(): Promise<boolean> {
    if (!this.scene || this.destroyed || !this.scene.tryFatalErrorRecovery || this.recoveringGraphics) return false;
    this.recoveringGraphics = true;
    this.callbacks.onGraphicsRecovery?.({
      state: "attempting",
      message: "3B grafik bağlamı kaybedildi; otomatik kurtarma deneniyor."
    });
    try {
      await this.scene.tryFatalErrorRecovery();
      const recovered = !this.scene.fatalError;
      this.callbacks.onGraphicsRecovery?.({
        state: recovered ? "recovered" : "failed",
        message: recovered
          ? "3B grafik bağlamı başarıyla kurtarıldı."
          : "3B grafik bağlamı otomatik olarak kurtarılamadı."
      });
      return recovered;
    } catch {
      this.callbacks.onGraphicsRecovery?.({
        state: "failed",
        message: "3B grafik bağlamı otomatik olarak kurtarılamadı."
      });
      return false;
    } finally {
      this.recoveringGraphics = false;
    }
  }

  private environmentFor(profile: PerformanceProfile) {
    const eco = profile === "eco";
    return {
      atmosphereEnabled: true,
      starsEnabled: false,
      lighting: {
        directShadowsEnabled: !eco,
        ambientOcclusionEnabled: profile === "high",
        cameraTrackingEnabled: false
      }
    };
  }

  private pruneLayerCache(): void {
    if (!this.map || this.destroyed) return;
    const maxCached = this.profile === "eco" ? 8 : this.profile === "balanced" ? 14 : 24;
    if (this.layers.size <= maxCached) return;
    const removable = [...this.layers.entries()].filter(([, layer]) => !layer.visible);
    for (const [id, layer] of removable.slice(0, Math.max(0, this.layers.size - maxCached))) {
      this.map.remove(layer);
      layer.destroy();
      this.layers.delete(id);
    }
  }
}

function pointProperties(camera: CameraState) {
  return {
    longitude: camera.longitude,
    latitude: camera.latitude,
    z: camera.z,
    spatialReference: { wkid: 4326 }
  };
}

function clampOpacity(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı (${Math.round(timeoutMs / 1000)} sn).`)), timeoutMs);
      })
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleString("tr-TR");
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("tr-TR") : "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Nesne]";
    }
  }
  return String(value);
}

function coordinateLabel(point: { latitude?: number | null; longitude?: number | null }): string | undefined {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return undefined;
  return `${point.latitude!.toFixed(5)}° N · ${point.longitude!.toFixed(5)}° E`;
}

function layerViewDetail(event: Event): LayerViewEventDetail | undefined {
  return event instanceof CustomEvent && event.detail && typeof event.detail === "object"
    ? event.detail as LayerViewEventDetail
    : undefined;
}

function domHandle(target: EventTarget, type: string, listener: EventListener): Removable {
  target.addEventListener(type, listener);
  return { remove: () => target.removeEventListener(type, listener) };
}
