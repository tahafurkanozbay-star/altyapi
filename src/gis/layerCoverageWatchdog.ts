const MAIN_SCENE_ID = "altyapi-main-scene";
const COVERAGE_PADDING_FACTOR = 1.12;
const ACTIVATION_NAVIGATION_DEBOUNCE_MS = 120;
const GEOGRAPHIC_WKID = 4326;
const WEB_MERCATOR_WKID = 3857;
const EARTH_RADIUS_M = 6_378_137;
const WEB_MERCATOR_HALF_WORLD_M = Math.PI * EARTH_RADIUS_M;
const MAX_WEB_MERCATOR_LATITUDE = 85.0511287798066;

type Removable = { remove(): void };

type SpatialReferenceLike = {
  wkid?: unknown;
  latestWkid?: unknown;
};

export type ExtentLike = {
  xmin?: unknown;
  ymin?: unknown;
  xmax?: unknown;
  ymax?: unknown;
  spatialReference?: SpatialReferenceLike | null;
  expand?: (factor: number) => unknown;
};

type NormalizedExtent = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

type LayerLike = {
  id?: string;
  visible?: boolean;
  fullExtent?: ExtentLike | null;
  watch?: (property: "visible", callback: (value: unknown) => void) => Removable;
};

type LayerViewLike = {
  layer?: LayerLike;
  visible?: boolean;
  watch?: (property: "visible", callback: (value: unknown) => void) => Removable;
};

type LayerViewEventDetail = {
  layer?: LayerLike;
  layerView?: LayerViewLike;
};

type SceneLike = HTMLElement & {
  extent?: ExtentLike | null;
  goTo?: (target: unknown, options?: unknown) => Promise<unknown>;
};

export type ExtentOverlapState = "intersects" | "disjoint" | "unknown";

/**
 * Compares provider and Scene extents conservatively. Matching coordinate
 * systems are compared directly. The only cross-SR conversion performed by the
 * watchdog is the mathematically deterministic WGS84 geographic <-> Web
 * Mercator pair used by ArcGIS basemaps and common OGC services. Arbitrary
 * projected coordinate systems remain "unknown" instead of risking a wrong
 * automatic camera jump.
 */
export function extentOverlapState(
  viewExtent: ExtentLike | null | undefined,
  layerExtent: ExtentLike | null | undefined
): ExtentOverlapState {
  const view = normalizedExtent(viewExtent);
  const layer = normalizedExtent(layerExtent);
  if (!view || !layer) return "unknown";

  const viewWkid = canonicalWkid(viewExtent?.spatialReference);
  const layerWkid = canonicalWkid(layerExtent?.spatialReference);
  if (viewWkid === undefined || layerWkid === undefined) return "unknown";

  const comparableLayer = layerWkid === viewWkid
    ? layer
    : projectExtentForComparison(layer, layerWkid, viewWkid);
  if (!comparableLayer) return "unknown";

  return extentsAreDisjoint(view, comparableLayer) ? "disjoint" : "intersects";
}

/**
 * Projects a normalized extent only for the supported geographic/Web Mercator
 * pair. The function is exported so regression tests can pin the numeric safety
 * behavior without requiring a live ArcGIS view.
 */
export function projectExtentForComparison(
  extent: NormalizedExtent,
  fromWkid: number,
  toWkid: number
): NormalizedExtent | undefined {
  const from = canonicalNumericWkid(fromWkid);
  const to = canonicalNumericWkid(toWkid);
  if (!from || !to) return undefined;
  if (from === to) return { ...extent };

  if (from === GEOGRAPHIC_WKID && to === WEB_MERCATOR_WKID) {
    if (!isGeographicExtent(extent)) return undefined;
    const southwest = geographicToWebMercator(extent.xmin, extent.ymin);
    const northeast = geographicToWebMercator(extent.xmax, extent.ymax);
    return normalizedExtentFromNumbers(southwest.x, southwest.y, northeast.x, northeast.y);
  }

  if (from === WEB_MERCATOR_WKID && to === GEOGRAPHIC_WKID) {
    if (!isWebMercatorExtent(extent)) return undefined;
    const southwest = webMercatorToGeographic(extent.xmin, extent.ymin);
    const northeast = webMercatorToGeographic(extent.xmax, extent.ymax);
    return normalizedExtentFromNumbers(southwest.longitude, southwest.latitude, northeast.longitude, northeast.latitude);
  }

  return undefined;
}

export function shouldAutoFocusLayerCoverage(
  viewExtent: ExtentLike | null | undefined,
  layerExtent: ExtentLike | null | undefined
): boolean {
  return extentOverlapState(viewExtent, layerExtent) === "disjoint";
}

export function layerCoverageTarget(layerExtent: ExtentLike): unknown {
  if (typeof layerExtent.expand === "function") {
    try {
      return layerExtent.expand(COVERAGE_PADDING_FACTOR);
    } catch {
      // Fall through to the provider extent itself.
    }
  }
  return layerExtent;
}

/**
 * Keeps activation navigation conservative: a service layer is focused only on
 * a false -> true visibility transition and only when its loaded fullExtent is
 * provably disjoint from the current Scene extent. Temporary LayerView recycle
 * events do not re-focus the map, while a real hide/show arms the layer again.
 */
export function installLayerCoverageWatchdog(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const visibility = new Map<string, boolean>();
  const handles = new Map<string, Removable[]>();
  let navigationGeneration = 0;
  let navigationTimer = 0;

  const clearHandles = (layerId: string) => {
    for (const handle of handles.get(layerId) ?? []) {
      try { handle.remove(); } catch { /* ArcGIS teardown is best-effort */ }
    }
    handles.delete(layerId);
  };

  const evaluateActivation = (scene: SceneLike, layerView: LayerViewLike) => {
    const layer = layerView.layer;
    const layerId = layer?.id;
    if (!layer || !layerId?.startsWith("svc-")) return;

    const nowVisible = layer.visible !== false && layerView.visible !== false;
    const wasVisible = visibility.get(layerId) === true;
    visibility.set(layerId, nowVisible);
    if (!nowVisible || wasVisible) return;

    const fullExtent = layer.fullExtent;
    if (!fullExtent || !scene.goTo || !shouldAutoFocusLayerCoverage(scene.extent, fullExtent)) return;

    const generation = ++navigationGeneration;
    window.clearTimeout(navigationTimer);
    navigationTimer = window.setTimeout(() => {
      if (
        generation !== navigationGeneration ||
        !scene.isConnected ||
        layer.visible === false ||
        layerView.visible === false ||
        !shouldAutoFocusLayerCoverage(scene.extent, fullExtent)
      ) return;

      const target = layerCoverageTarget(fullExtent);
      void scene.goTo?.(target, { duration: 820, easing: "ease-in-out" }).catch(() => undefined);
    }, ACTIVATION_NAVIGATION_DEBOUNCE_MS);
  };

  const onLayerViewCreate = (event: Event) => {
    const scene = sceneFromEvent(event);
    const detail = customDetail(event);
    const layerView = detail?.layerView;
    const layer = layerView?.layer ?? detail?.layer;
    const layerId = layer?.id;
    if (!scene || !layerView || !layer || !layerId?.startsWith("svc-")) return;

    clearHandles(layerId);
    evaluateActivation(scene, layerView);

    const nextHandles: Removable[] = [];
    try {
      if (typeof layerView.watch === "function") {
        nextHandles.push(layerView.watch("visible", () => evaluateActivation(scene, layerView)));
      }
      if (typeof layer.watch === "function") {
        nextHandles.push(layer.watch("visible", () => evaluateActivation(scene, layerView)));
      }
    } catch {
      for (const handle of nextHandles) {
        try { handle.remove(); } catch { /* best-effort */ }
      }
      nextHandles.length = 0;
    }
    if (nextHandles.length) handles.set(layerId, nextHandles);
  };

  const onLayerViewDestroy = (event: Event) => {
    const detail = customDetail(event);
    const layer = detail?.layerView?.layer ?? detail?.layer;
    const layerId = layer?.id;
    if (!layerId?.startsWith("svc-")) return;
    clearHandles(layerId);

    // A visible layer can be destroyed/recreated by render recovery. Preserve
    // its activation state so recycle never causes a second camera jump.
    if (layer?.visible === false) visibility.delete(layerId);
  };

  document.addEventListener("arcgisViewLayerviewCreate", onLayerViewCreate as EventListener);
  document.addEventListener("arcgisViewLayerviewDestroy", onLayerViewDestroy as EventListener);

  return () => {
    window.clearTimeout(navigationTimer);
    document.removeEventListener("arcgisViewLayerviewCreate", onLayerViewCreate as EventListener);
    document.removeEventListener("arcgisViewLayerviewDestroy", onLayerViewDestroy as EventListener);
    for (const layerId of [...handles.keys()]) clearHandles(layerId);
    visibility.clear();
    navigationGeneration += 1;
  };
}

function sceneFromEvent(event: Event): SceneLike | undefined {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLElement && node.id === MAIN_SCENE_ID) return node as SceneLike;
  }
  const fallback = document.getElementById(MAIN_SCENE_ID);
  return fallback instanceof HTMLElement ? fallback as SceneLike : undefined;
}

function customDetail(event: Event): LayerViewEventDetail | undefined {
  return event instanceof CustomEvent && event.detail && typeof event.detail === "object"
    ? event.detail as LayerViewEventDetail
    : undefined;
}

function normalizedExtent(extent: ExtentLike | null | undefined): NormalizedExtent | undefined {
  return normalizedExtentFromNumbers(
    finiteNumber(extent?.xmin),
    finiteNumber(extent?.ymin),
    finiteNumber(extent?.xmax),
    finiteNumber(extent?.ymax)
  );
}

function normalizedExtentFromNumbers(
  xmin: number | undefined,
  ymin: number | undefined,
  xmax: number | undefined,
  ymax: number | undefined
): NormalizedExtent | undefined {
  if (xmin === undefined || ymin === undefined || xmax === undefined || ymax === undefined) return undefined;
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) return undefined;
  if (xmax <= xmin || ymax <= ymin) return undefined;
  return { xmin, ymin, xmax, ymax };
}

function canonicalWkid(spatialReference: SpatialReferenceLike | null | undefined): number | undefined {
  const candidate = finiteNumber(spatialReference?.latestWkid) ?? finiteNumber(spatialReference?.wkid);
  return candidate === undefined ? undefined : canonicalNumericWkid(candidate);
}

function canonicalNumericWkid(candidate: number): number | undefined {
  if (!Number.isInteger(candidate) || candidate <= 0) return undefined;
  if (candidate === 102100 || candidate === 102113 || candidate === 900913) return WEB_MERCATOR_WKID;
  return candidate;
}

function extentsAreDisjoint(first: NormalizedExtent, second: NormalizedExtent): boolean {
  return first.xmax < second.xmin || first.xmin > second.xmax || first.ymax < second.ymin || first.ymin > second.ymax;
}

function isGeographicExtent(extent: NormalizedExtent): boolean {
  return extent.xmin >= -180 && extent.xmax <= 180 && extent.ymin >= -90 && extent.ymax <= 90;
}

function isWebMercatorExtent(extent: NormalizedExtent): boolean {
  const tolerance = WEB_MERCATOR_HALF_WORLD_M * 1.01;
  return extent.xmin >= -tolerance && extent.xmax <= tolerance && extent.ymin >= -tolerance && extent.ymax <= tolerance;
}

function geographicToWebMercator(longitude: number, latitude: number): { x: number; y: number } {
  const safeLatitude = Math.max(-MAX_WEB_MERCATOR_LATITUDE, Math.min(MAX_WEB_MERCATOR_LATITUDE, latitude));
  const longitudeRadians = longitude * Math.PI / 180;
  const latitudeRadians = safeLatitude * Math.PI / 180;
  return {
    x: EARTH_RADIUS_M * longitudeRadians,
    y: EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))
  };
}

function webMercatorToGeographic(x: number, y: number): { longitude: number; latitude: number } {
  return {
    longitude: x / EARTH_RADIUS_M * 180 / Math.PI,
    latitude: Math.atan(Math.sinh(y / EARTH_RADIUS_M)) * 180 / Math.PI
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
