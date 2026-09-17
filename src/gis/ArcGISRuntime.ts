import type Layer from "@arcgis/core/layers/Layer.js";
import type ArcGISMap from "@arcgis/core/Map.js";
import type SceneView from "@arcgis/core/views/SceneView.js";
import { createLayer } from "./layerFactory";
import { profileToSceneQuality } from "../lib/performance";
import type {
  CameraState,
  IdentifyResult,
  PerformanceProfile,
  SceneTelemetry,
  ServiceDefinition,
  ToolId
} from "../types";

type Removable = { remove(): void };
type WidgetLike = { destroy(): void; container?: string | HTMLElement | null };

export interface RuntimeCallbacks {
  onIdentify?: (result: IdentifyResult | null) => void;
  onTelemetry?: (telemetry: SceneTelemetry) => void;
  onCamera?: (camera: CameraState) => void;
}

export interface LayerLoadResult {
  ok: boolean;
  error?: string;
  durationMs?: number;
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
  private view?: SceneView;
  private readonly layers = new Map<string, Layer>();
  private activeWidget?: WidgetLike;
  private searchWidget?: WidgetLike;
  private navigationWidgets: WidgetLike[] = [];
  private handles: Removable[] = [];
  private callbacks: RuntimeCallbacks = {};
  private cameraTimer = 0;
  private telemetryFrame = 0;
  private profile: PerformanceProfile;
  private destroyed = false;

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

    const [{ default: MapCtor }, { default: SceneViewCtor }, { default: config }] = await Promise.all([
      import("@arcgis/core/Map.js"),
      import("@arcgis/core/views/SceneView.js"),
      import("@arcgis/core/config.js")
    ]);
    if (this.destroyed) return;

    config.request.timeout = 30_000;
    const map = new MapCtor({ basemap, ground: "world-elevation" });
    const view = new SceneViewCtor({
      container,
      map,
      viewingMode: "local",
      camera: {
        position: pointProperties(camera),
        heading: camera.heading,
        tilt: camera.tilt
      },
      qualityProfile: profileToSceneQuality(this.profile),
      popupEnabled: false,
      environment: this.environmentFor(this.profile)
    });

    this.map = map;
    this.view = view;
    await view.when();
    if (this.destroyed) {
      view.destroy();
      this.view = undefined;
      this.map = undefined;
      return;
    }
    this.installViewEvents();
  }

  async mountSearch(container: HTMLDivElement): Promise<void> {
    if (!this.view || this.destroyed) return;
    this.searchWidget?.destroy();
    this.searchWidget = undefined;
    container.replaceChildren();

    const { default: Search } = await import("@arcgis/core/widgets/Search.js");
    if (!this.view || this.destroyed) return;
    this.searchWidget = new Search({
      view: this.view,
      container,
      includeDefaultSources: true,
      locationEnabled: false,
      popupEnabled: false,
      resultGraphicEnabled: true
    });
  }

  async mountNavigation(container: HTMLDivElement): Promise<() => void> {
    if (!this.view || this.destroyed) return () => undefined;
    this.destroyNavigation();
    container.replaceChildren();

    const [homeModule, compassModule, locateModule, fullscreenModule] = await Promise.all([
      import("@arcgis/core/widgets/Home.js"),
      import("@arcgis/core/widgets/Compass.js"),
      import("@arcgis/core/widgets/Locate.js"),
      import("@arcgis/core/widgets/Fullscreen.js")
    ]);
    if (!this.view || this.destroyed) return () => undefined;

    const widgets: WidgetLike[] = [
      new homeModule.default({ view: this.view }),
      new compassModule.default({ view: this.view }),
      new locateModule.default({ view: this.view }),
      new fullscreenModule.default({ view: this.view, element: document.documentElement })
    ];
    this.navigationWidgets = widgets;

    for (const widget of widgets) {
      const node = document.createElement("div");
      node.className = "arcgis-nav-slot";
      container.append(node);
      widget.container = node;
    }

    return () => {
      for (const widget of widgets) widget.destroy();
      if (this.navigationWidgets === widgets) this.navigationWidgets = [];
      for (const node of [...container.querySelectorAll(".arcgis-nav-slot")]) node.remove();
    };
  }

  async setLayerVisible(service: ServiceDefinition, visible: boolean): Promise<LayerLoadResult> {
    if (!this.map || !this.view || this.destroyed) {
      return { ok: false, error: "Harita motoru henüz hazır değil." };
    }

    let layer = this.layers.get(service.id);
    if (!layer && visible) {
      const startedAt = performance.now();
      try {
        layer = await createLayer(service);
        if (this.destroyed) {
          layer.destroy();
          return { ok: false, error: "Harita oturumu kapatıldı." };
        }
        this.layers.set(service.id, layer);
        this.map.add(layer);
        await layer.load();
        if (this.destroyed) return { ok: false, error: "Harita oturumu kapatıldı." };
        layer.opacity = clampOpacity(service.opacity);
        layer.visible = true;
        this.pruneLayerCache();
        return { ok: true, durationMs: Math.round(performance.now() - startedAt) };
      } catch (error) {
        if (layer) {
          this.map.remove(layer);
          layer.destroy();
        }
        this.layers.delete(service.id);
        return {
          ok: false,
          error: readableError(error),
          durationMs: Math.round(performance.now() - startedAt)
        };
      }
    }

    if (layer) layer.visible = visible;
    return { ok: true, durationMs: 0 };
  }

  setOpacity(serviceId: string, opacity: number): void {
    const layer = this.layers.get(serviceId);
    if (layer) layer.opacity = clampOpacity(opacity);
  }

  async reloadLayer(service: ServiceDefinition): Promise<LayerLoadResult> {
    if (this.destroyed) return { ok: false, error: "Harita oturumu kapatıldı." };
    const existing = this.layers.get(service.id);
    if (existing) {
      this.map?.remove(existing);
      existing.destroy();
      this.layers.delete(service.id);
    }
    return this.setLayerVisible(service, true);
  }

  async zoomToLayer(serviceId: string): Promise<boolean> {
    if (!this.view || this.destroyed) return false;
    const layer = this.layers.get(serviceId);
    if (!layer) return false;
    try {
      await layer.load();
      const extent = layer.fullExtent;
      if (!extent) return false;
      await this.view.goTo(extent.expand(1.2), { duration: 900, easing: "ease-in-out" });
      return true;
    } catch {
      return false;
    }
  }

  setBasemap(basemap: string): void {
    if (this.map && !this.destroyed) this.map.basemap = basemap;
  }

  setPerformanceProfile(profile: PerformanceProfile): void {
    this.profile = profile;
    if (!this.view || this.destroyed) return;
    this.view.qualityProfile = profileToSceneQuality(profile);
    this.view.environment = this.environmentFor(profile);
    this.pruneLayerCache();
  }

  async openTool(tool: Exclude<ToolId, null>, container: HTMLDivElement): Promise<void> {
    if (!this.view || this.destroyed) throw new Error("Harita motoru hazır değil.");
    this.closeTool();
    container.replaceChildren();
    this.activeWidget = await this.createToolWidget(tool, container);
  }

  closeTool(): void {
    this.activeWidget?.destroy();
    this.activeWidget = undefined;
  }

  async goHome(): Promise<void> {
    await this.goTo(HOME_CAMERA);
  }

  async goTo(camera: CameraState): Promise<void> {
    if (!this.view || this.destroyed) return;
    await this.view.goTo(
      {
        position: pointProperties(camera),
        heading: camera.heading,
        tilt: camera.tilt
      },
      { duration: 950, easing: "ease-in-out" }
    );
  }

  getCamera(): CameraState {
    if (!this.view || this.destroyed) return HOME_CAMERA;
    const camera = this.view.camera;
    return {
      longitude: camera.position.longitude ?? HOME_CAMERA.longitude,
      latitude: camera.position.latitude ?? HOME_CAMERA.latitude,
      z: camera.position.z ?? HOME_CAMERA.z,
      heading: camera.heading ?? HOME_CAMERA.heading,
      tilt: camera.tilt ?? HOME_CAMERA.tilt
    };
  }

  async takeScreenshot(): Promise<string | undefined> {
    if (!this.view || this.destroyed) return undefined;
    try {
      const result = await this.view.takeScreenshot({
        format: "png",
        width: Math.min(innerWidth * devicePixelRatio, 2400)
      });
      return result.dataUrl;
    } catch {
      return undefined;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.clearTimeout(this.cameraTimer);
    cancelAnimationFrame(this.telemetryFrame);
    this.closeTool();
    this.searchWidget?.destroy();
    this.searchWidget = undefined;
    this.destroyNavigation();
    for (const handle of this.handles) handle.remove();
    this.handles = [];
    for (const layer of this.layers.values()) layer.destroy();
    this.layers.clear();
    this.callbacks = {};
    this.view?.destroy();
    this.view = undefined;
    this.map = undefined;
  }

  private destroyNavigation(): void {
    for (const widget of this.navigationWidgets) widget.destroy();
    this.navigationWidgets = [];
  }

  private installViewEvents(): void {
    if (!this.view) return;

    this.handles.push(
      this.view.on("click", async (event) => {
        if (!this.view || this.destroyed) return;
        try {
          const hit = await this.view.hitTest(event);
          if (this.destroyed) return;
          const graphicHit = hit.results.find((result) => result.type === "graphic");
          if (!graphicHit || graphicHit.type !== "graphic") {
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
      this.view.on("pointer-move", (event) => {
        if (!this.view || this.destroyed || document.hidden) return;
        cancelAnimationFrame(this.telemetryFrame);
        this.telemetryFrame = requestAnimationFrame(() => {
          if (!this.view || this.destroyed) return;
          const point = this.view.toMap({ x: event.x, y: event.y });
          const camera = this.view.camera;
          this.callbacks.onTelemetry?.({
            latitude: point?.latitude ?? undefined,
            longitude: point?.longitude ?? undefined,
            altitude: camera.position.z ?? 0,
            tilt: camera.tilt ?? 0,
            heading: camera.heading ?? 0,
            scale: this.view.scale
          });
        });
      })
    );

    this.handles.push(
      this.view.watch("camera", () => {
        if (this.destroyed) return;
        window.clearTimeout(this.cameraTimer);
        this.cameraTimer = window.setTimeout(() => {
          if (!this.destroyed) this.callbacks.onCamera?.(this.getCamera());
        }, 350);
      })
    );
  }

  private async createToolWidget(tool: Exclude<ToolId, null>, container: HTMLDivElement): Promise<WidgetLike> {
    if (!this.view || this.destroyed) throw new Error("Harita motoru hazır değil.");
    const view = this.view;

    switch (tool) {
      case "legend": {
        const { default: Legend } = await import("@arcgis/core/widgets/Legend.js");
        return new Legend({ view, container });
      }
      case "basemap": {
        const { default: BasemapGallery } = await import("@arcgis/core/widgets/BasemapGallery.js");
        return new BasemapGallery({ view, container });
      }
      case "distance": {
        const { default: DirectLineMeasurement3D } = await import("@arcgis/core/widgets/DirectLineMeasurement3D.js");
        return new DirectLineMeasurement3D({ view, container });
      }
      case "area": {
        const { default: AreaMeasurement3D } = await import("@arcgis/core/widgets/AreaMeasurement3D.js");
        return new AreaMeasurement3D({ view, container });
      }
      case "daylight": {
        const { default: Daylight } = await import("@arcgis/core/widgets/Daylight.js");
        return new Daylight({ view, container });
      }
      case "slice": {
        const { default: Slice } = await import("@arcgis/core/widgets/Slice.js");
        return new Slice({ view, container });
      }
      case "lineOfSight": {
        const { default: LineOfSight } = await import("@arcgis/core/widgets/LineOfSight.js");
        return new LineOfSight({ view, container });
      }
      case "elevation": {
        const { default: ElevationProfile } = await import("@arcgis/core/widgets/ElevationProfile.js");
        return new ElevationProfile({ view, container, profiles: [{ type: "ground" }] });
      }
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

function readableError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message || "Servis yüklenemedi.";
    if (/cors|cross-origin/i.test(message)) return "Servis CORS politikasına tarayıcı erişimi vermiyor.";
    if (/timeout/i.test(message)) return "Servis zaman aşımına uğradı.";
    if (/401|403|unauthor|forbidden/i.test(message)) return "Servis kimlik doğrulaması veya yetkilendirme istiyor.";
    return message.length > 190 ? `${message.slice(0, 187)}…` : message;
  }
  return "Servis yüklenemedi.";
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
