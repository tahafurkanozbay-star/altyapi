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
  operationalExtentContains,
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

export interface LayerLoadResult {
  ok: boolean;
  error?: string;
  durationMs?: number;
  superseded?: boolean;
  attempts?: number;
  recovered?: boolean;
  failureClass?: ServiceFailureClass;
}

export interface OperationalNavigationResult {
  moved: boolean;
  reason?: "outside-extent" | "scale-too-far" | "scale-too-close";
  targetScale?: number;
}

const HOME_CAMERA: CameraState = {
  longitude: 32.8542,
  latitude: 39.9208,
  z: 5200,
  heading: 2,
  tilt: 58
};

export class ArcGISRuntime {
  private map?: ArcGISMap;
  private scene?: ArcGISSceneElement;
  private readonly layers = new Map<string, Layer>();
  private readonly loadingLayers = new Map<string, Promise<LayerLoadResult>>();
  private readonly desiredVisibility = new Map<string, boolean>();
  private readonly activeScaleServices = new Map<string, ServiceDefinition>();
  private readonly runtimeScaleServices = new Map<string, ServiceDefinition>();
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
      this.setScaleGuard(service, false);
      const existing = this.layers.get(service.id);
      if (existing) existing.visible = false;
      return { ok: true, durationMs: 0 };
    }

    // Register the guard at intent time, not after a potentially slow network load.
    // This makes startup restore, workspace import and manual activation share the same atomic zoom policy.
    this.setScaleGuard(service, true);

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
      existing.opacity = clampOpacity(service.opacity);
      existing.visible = true;
      return { ok: true, durationMs: 0 };
    }

    const operation = this.loadLayer(service);
    this.loadingLayers.set(service.id, operation);
    try {
      return await operation;
    } finally {
      if (this.loadingLayers.get(service.id) === operation) this.loadingLayers.delete(service.id);
    }
  }

  setOpacity(serviceId: string, opacity: number): void {
    const layer = this.layers.get(serviceId);
    if (layer) layer.opacity = clampOpacity(opacity);
  }

  async reloadLayer(service: ServiceDefinition): Promise<LayerLoadResult> {
    if (this.destroyed) return { ok: false, error: "Harita oturumu kapatıldı." };

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

  async prepareLayerActivation(service: ServiceDefinition): Promise<OperationalNavigationResult> {
    const scaleService = this.runtimeScaleServices.get(service.id) ?? service;
    if (
      !this.scene ||
      this.destroyed ||
      (!scaleService.renderScaleSensitive && !hasOperationalScaleConstraint(scaleService))
    ) return { moved: false };

    const camera = this.scene.camera;
    const longitude = camera?.position.longitude;
    const latitude = camera?.position.latitude;
    const scale = this.scene.scale ?? Number.NaN;
    const insideExtent =
      scaleService.operationalExtent && Number.isFinite(longitude) && Number.isFinite(latitude)
        ? operationalExtentContains(scaleService, longitude!, latitude!)
        : true;

    // Plan against the currently active constrained layers plus the candidate before loading it.
    // This prevents a second corrective snap after the layer becomes active.
    const range = resolveOperationalScaleRange([...this.activeScaleServices.values()], scaleService);
    const clampedCurrentScale = clampScaleToOperationalRange(scale, range);
    const insideScale =
      !Number.isFinite(scale) ||
      scale <= 0 ||
      Math.abs(clampedCurrentScale - scale) / scale < 0.002;

    if (insideExtent && insideScale) return { moved: false };

    let reason: OperationalNavigationResult["reason"];
    if (!insideExtent) reason = "outside-extent";
    else if (range.minScale && scale > range.minScale) reason = "scale-too-far";
    else if (range.maxScale && scale < range.maxScale) reason = "scale-too-close";

    const preferredScale = targetOperationalScale(scaleService, scale);
    const targetScale = clampScaleToOperationalRange(preferredScale, range);
    const targetCenter =
      !insideExtent && scaleService.operationalExtent
        ? operationalExtentCenter(scaleService.operationalExtent)
        : {
            longitude: longitude ?? HOME_CAMERA.longitude,
            latitude: latitude ?? HOME_CAMERA.latitude
          };

    try {
      const { default: Point } = await import("@arcgis/core/geometry/Point.js");
      if (!this.scene || this.destroyed) return { moved: false };
      const target = new Point({
        longitude: targetCenter.longitude,
        latitude: targetCenter.latitude,
        spatialReference: { wkid: 4326 }
      });
      await this.scene.goTo?.(
        { target, scale: targetScale },
        { duration: 780, easing: "ease-in-out" }
      );
      return { moved: true, reason, targetScale };
    } catch {
      return { moved: false };
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

        // Live provider metadata is authoritative only when it tightens the
        // verified/client-learned profile. Cache it for hide/show cycles so a
        // reopened layer enters its real range before any network work starts.
        const runtimeScale = runtimeScaleRangeFromLoadedLayer(layer);
        const reconciledService = reconcileServiceRuntimeScale(service, runtimeScale);
        this.runtimeScaleServices.set(service.id, reconciledService);
        this.setScaleGuard(reconciledService, true);

        layer.opacity = clampOpacity(service.opacity);
        layer.visible = true;
        this.layers.set(service.id, layer);
        this.map?.add(layer);
        this.pruneLayerCache();
        return {
          ok: true,
          durationMs: Math.round(performance.now() - startedAt),
          attempts,
          recovered: attempts > 1
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

  private cleanupLayer(serviceId: string, layer: Layer): void {
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

  private setScaleGuard(service: ServiceDefinition, active: boolean): void {
    const scaleService = active ? (this.runtimeScaleServices.get(service.id) ?? service) : service;
    if (!hasOperationalScaleConstraint(scaleService)) {
      this.activeScaleServices.delete(service.id);
      return;
    }

    if (active) {
      // Reinsert so Map iteration preserves most-recent activation priority for impossible intersections.
      this.activeScaleServices.delete(service.id);
      this.activeScaleServices.set(service.id, scaleService);
      this.enforceScaleGuard();
    } else {
      this.activeScaleServices.delete(service.id);
    }
    this.scheduleScaleGuard();
  }

  private scheduleScaleGuard(): void {
    if (!this.scene || this.destroyed) return;
    window.clearTimeout(this.scaleGuardTimer);
    this.scaleGuardTimer = window.setTimeout(() => this.enforceScaleGuard(), 110);
  }

  private enforceScaleGuard(): void {
    const scene = this.scene;
    if (!scene || this.destroyed || this.scaleGuardApplying || this.activeScaleServices.size === 0) return;

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

function targetOperationalScale(service: ServiceDefinition, currentScale: number): number {
  const recommended = recommendedActivationScale(service);
  if (!Number.isFinite(currentScale) || currentScale <= 0) return recommended ?? 250_000;

  if (service.operationalMinScale && currentScale > service.operationalMinScale) {
    return recommended && recommended <= service.operationalMinScale
      ? recommended
      : Math.round(service.operationalMinScale * 0.75);
  }

  if (service.operationalMaxScale && currentScale < service.operationalMaxScale) {
    return Math.round(service.operationalMaxScale * 1.25);
  }

  return currentScale;
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

function domHandle(target: EventTarget, type: string, listener: EventListener): Removable {
  target.addEventListener(type, listener);
  return { remove: () => target.removeEventListener(type, listener) };
}
