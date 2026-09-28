const COVERAGE_PADDING_FACTOR = 1.12;
const COVERAGE_SCALE_INSET = 0.04;
const GEOGRAPHIC_WKID = 4326;
const WEB_MERCATOR_WKID = 3857;
const EARTH_RADIUS_M = 6_378_137;
const WEB_MERCATOR_HALF_WORLD_M = Math.PI * EARTH_RADIUS_M;
const MAX_WEB_MERCATOR_LATITUDE = 85.0511287798066;

type SpatialReferenceLike = {
  wkid?: unknown;
  latestWkid?: unknown;
};

export type ExtentLike = {
  xmin?: unknown;
  ymin?: unknown;
  xmax?: unknown;
  ymax?: unknown;
  center?: unknown;
  spatialReference?: SpatialReferenceLike | null;
  expand?: (factor: number) => unknown;
};

type NormalizedExtent = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

export type ExtentOverlapState = "intersects" | "disjoint" | "unknown";

/**
 * Compares provider and Scene extents conservatively. Matching coordinate
 * systems are compared directly. The only cross-SR conversion performed is the
 * deterministic WGS84 geographic <-> Web Mercator pair used by ArcGIS basemaps
 * and common OGC services. Arbitrary projected coordinate systems remain
 * "unknown" instead of risking a wrong automatic camera jump.
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
 * pair. Exported so regression tests can pin numeric safety behavior without a
 * live ArcGIS view.
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
 * Chooses a scale safely inside a provider ArcGIS visibility interval. This is
 * retained as a pure compatibility helper; v27 camera ownership lives in
 * ArcGISRuntime's atomic activation transaction rather than a global DOM
 * LayerView watcher.
 */
export function coverageSafeScale(
  currentScale: unknown,
  minScaleValue: unknown,
  maxScaleValue: unknown
): number | undefined {
  const minScale = positiveScale(minScaleValue);
  const maxScale = positiveScale(maxScaleValue);
  if (!minScale && !maxScale) return undefined;
  if (minScale && maxScale && maxScale > minScale) return undefined;

  let target = positiveScale(currentScale);
  if (!target) {
    if (minScale && maxScale) target = Math.sqrt(minScale * maxScale);
    else if (minScale) target = minScale * (1 - COVERAGE_SCALE_INSET);
    else if (maxScale) target = maxScale * (1 + COVERAGE_SCALE_INSET);
  }

  if (!target) return undefined;
  if (minScale && target > minScale) target = minScale * (1 - COVERAGE_SCALE_INSET);
  if (maxScale && target < maxScale) target = maxScale * (1 + COVERAGE_SCALE_INSET);

  if (minScale && maxScale && (target > minScale || target < maxScale)) {
    target = Math.sqrt(minScale * maxScale);
  }
  return Math.max(1, Math.round(target));
}

export function layerCoverageNavigationTarget(
  layerExtent: ExtentLike,
  currentScale: unknown,
  minScale: unknown,
  maxScale: unknown
): unknown {
  const safeScale = coverageSafeScale(currentScale, minScale, maxScale);
  if (!safeScale) return layerCoverageTarget(layerExtent);
  return {
    target: layerExtent.center ?? layerExtent,
    scale: safeScale
  };
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

function positiveScale(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  return numeric !== undefined && numeric > 0 ? numeric : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
