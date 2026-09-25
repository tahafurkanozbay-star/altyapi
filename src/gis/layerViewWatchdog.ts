import { runtimeScaleRangeFromLoadedLayer } from "../lib/runtimeScale";

const MAIN_SCENE_ID = "altyapi-main-scene";
const SCALE_REPAIR_INSET = 0.04;
const SCALE_REPAIR_COOLDOWN_MS = 240;
const SCALE_REPAIR_RECHECK_MS = 280;
const MAX_SCALE_REPAIRS_PER_VIOLATION = 2;
const MAX_LAYER_VIEW_RECYCLES = 1;

type LayerLike = {
  id?: string;
  visible?: boolean;
  minScale?: unknown;
  maxScale?: unknown;
  sublayers?: unknown;
};

type LayerViewLike = {
  layer?: LayerLike;
  visible?: boolean;
  visibleAtCurrentScale?: boolean;
  suspended?: boolean;
  updating?: boolean;
};

type LayerViewEventDetail = {
  layer?: LayerLike;
  layerView?: LayerViewLike;
  error?: unknown;
};

type LayerCollectionLike = {
  indexOf?: (layer: unknown) => number;
};

type MapLike = {
  layers?: LayerCollectionLike;
  add(layer: unknown, index?: number): void;
  remove(layer: unknown): void;
};

type SceneLike = HTMLElement & {
  scale?: number;
  map?: MapLike | null;
};

export interface LayerViewScaleIntersection {
  minScale?: number;
  maxScale?: number;
  constrainedLayerIds: string[];
  violatingLayerIds: string[];
  conflict: boolean;
}

/**
 * Builds the provider-side scale intersection from LayerViews that are actually
 * visible in the public map. Hidden layers are deliberately ignored so closing
 * a layer immediately removes its watchdog constraint.
 */
export function layerViewScaleIntersection(layerViews: Iterable<LayerViewLike>): LayerViewScaleIntersection {
  const minScales: number[] = [];
  const maxScales: number[] = [];
  const constrainedLayerIds: string[] = [];
  const violatingLayerIds: string[] = [];

  for (const layerView of layerViews) {
    const layer = layerView.layer;
    const layerId = layer?.id;
    if (!layer || !layerId?.startsWith("svc-")) continue;
    if (layer.visible === false || layerView.visible === false) continue;

    const range = runtimeScaleRangeFromLoadedLayer(layer);
    if (range) {
      constrainedLayerIds.push(layerId);
      if (range.minScale) minScales.push(range.minScale);
      if (range.maxScale) maxScales.push(range.maxScale);
    }

    if (layerView.visibleAtCurrentScale === false) violatingLayerIds.push(layerId);
  }

  const minScale = minScales.length ? Math.min(...minScales) : undefined;
  const maxScale = maxScales.length ? Math.max(...maxScales) : undefined;

  return {
    minScale,
    maxScale,
    constrainedLayerIds,
    violatingLayerIds,
    conflict: Boolean(minScale && maxScale && maxScale >= minScale)
  };
}

/**
 * Returns a decisive safe scale when ArcGIS itself reports that a visible
 * LayerView is outside its current provider scale. Exact provider boundaries
 * are avoided because WMS/ArcGIS renderers can disagree by a fraction during
 * animated zoom gestures.
 */
export function layerViewRecoveryScale(
  currentScale: number | undefined,
  state: Pick<LayerViewScaleIntersection, "minScale" | "maxScale" | "violatingLayerIds" | "conflict">
): number | undefined {
  if (state.conflict || state.violatingLayerIds.length === 0) return undefined;

  const minScale = state.minScale;
  const maxScale = state.maxScale;
  const current = Number(currentScale);

  if (Number.isFinite(current) && current > 0) {
    if (minScale && current > minScale) return clampInterior(Math.round(minScale * (1 - SCALE_REPAIR_INSET)), minScale, maxScale);
    if (maxScale && current < maxScale) return clampInterior(Math.round(maxScale * (1 + SCALE_REPAIR_INSET)), minScale, maxScale);
  }

  // ArcGIS says the layer is still invisible even though the numerical scale
  // appears valid. Move deeper into the provider interval instead of oscillating
  // on a boundary that may be rounded differently by the remote service.
  if (minScale && maxScale) return Math.max(1, Math.round(Math.sqrt(minScale * maxScale)));
  if (minScale) return Math.max(1, Math.round(minScale * 0.78));
  if (maxScale) return Math.max(1, Math.round(maxScale * 1.3));
  return undefined;
}

export function shouldRecycleLayerView(error: unknown): boolean {
  const text = errorText(error).toLocaleLowerCase("en-US");
  if (!text) return true;
  return ![
    /\b401\b/,
    /\b403\b/,
    /unauthori[sz]ed/,
    /forbidden/,
    /access denied/,
    /credential/,
    /authentication/,
    /invalid token/,
    /unsupported spatial reference/,
    /invalid url/,
    /malformed url/
  ].some((pattern) => pattern.test(text));
}

/**
 * Adds a second, provider-observed protection layer around the v18/v19 numeric
 * zoom guard. ArcGIS 5.x exposes LayerView.visibleAtCurrentScale and Scene
 * component LayerView lifecycle events, so we use the SDK's rendered state as a
 * final truth signal instead of trusting metadata alone.
 */
export function installSceneLayerWatchdog(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const layerViews = new Map<string, LayerViewLike>();
  const scaleRepairCounts = new Map<string, number>();
  const recycleCounts = new Map<string, number>();
  let auditTimer = 0;
  let lastScaleRepairAt = 0;

  const scheduleAudit = (scene: SceneLike, delay = 80) => {
    window.clearTimeout(auditTimer);
    auditTimer = window.setTimeout(() => audit(scene), delay);
  };

  const audit = (scene: SceneLike) => {
    if (!scene.isConnected) return;

    for (const [layerId, layerView] of layerViews) {
      if (layerView.visibleAtCurrentScale !== false || layerView.layer?.visible === false || layerView.visible === false) {
        scaleRepairCounts.delete(layerId);
      }
    }

    const state = layerViewScaleIntersection(layerViews.values());
    if (state.violatingLayerIds.length === 0 || state.conflict) return;

    const actionable = state.violatingLayerIds.filter(
      (layerId) => (scaleRepairCounts.get(layerId) ?? 0) < MAX_SCALE_REPAIRS_PER_VIOLATION
    );
    if (actionable.length === 0) return;

    const now = Date.now();
    if (now - lastScaleRepairAt < SCALE_REPAIR_COOLDOWN_MS) {
      scheduleAudit(scene, SCALE_REPAIR_COOLDOWN_MS);
      return;
    }

    const targetScale = layerViewRecoveryScale(scene.scale, state);
    if (!targetScale || !Number.isFinite(targetScale) || targetScale <= 0) return;

    const currentScale = Number(scene.scale);
    if (Number.isFinite(currentScale) && currentScale > 0) {
      const difference = Math.abs(targetScale - currentScale) / currentScale;
      if (difference < 0.001) return;
    }

    lastScaleRepairAt = now;
    for (const layerId of actionable) {
      scaleRepairCounts.set(layerId, (scaleRepairCounts.get(layerId) ?? 0) + 1);
    }
    scene.scale = targetScale;
    scheduleAudit(scene, SCALE_REPAIR_RECHECK_MS);
  };

  const onLayerViewCreate = (event: Event) => {
    const scene = sceneFromEvent(event);
    if (!scene) return;
    const detail = customDetail(event);
    const layerView = detail?.layerView;
    const layerId = layerView?.layer?.id ?? detail?.layer?.id;
    if (!layerView || !layerId?.startsWith("svc-")) return;
    layerViews.set(layerId, layerView);
    scaleRepairCounts.delete(layerId);
    recycleCounts.delete(layerId);
    scheduleAudit(scene, 40);
  };

  const onLayerViewDestroy = (event: Event) => {
    const detail = customDetail(event);
    const layerId = detail?.layerView?.layer?.id ?? detail?.layer?.id;
    if (!layerId?.startsWith("svc-")) return;
    layerViews.delete(layerId);
    scaleRepairCounts.delete(layerId);
  };

  const onLayerViewCreateError = (event: Event) => {
    const scene = sceneFromEvent(event);
    if (!scene) return;
    const detail = customDetail(event);
    const layer = detail?.layer;
    const layerId = layer?.id;
    if (!layer || !layerId?.startsWith("svc-") || layer.visible === false) return;
    if (!shouldRecycleLayerView(detail?.error)) return;

    const recycleCount = recycleCounts.get(layerId) ?? 0;
    if (recycleCount >= MAX_LAYER_VIEW_RECYCLES) return;
    recycleCounts.set(layerId, recycleCount + 1);

    window.dispatchEvent(new CustomEvent("altyapi:layerview-recovery", {
      detail: { layerId, attempt: recycleCount + 1 }
    }));

    window.setTimeout(() => recycleLayer(scene, layer), 320);
  };

  const onViewChange = (event: Event) => {
    const scene = sceneFromEvent(event);
    if (scene) scheduleAudit(scene);
  };

  const onOnline = () => {
    const scene = document.getElementById(MAIN_SCENE_ID) as SceneLike | null;
    if (scene) scheduleAudit(scene, 120);
  };

  document.addEventListener("arcgisViewLayerviewCreate", onLayerViewCreate as EventListener);
  document.addEventListener("arcgisViewLayerviewDestroy", onLayerViewDestroy as EventListener);
  document.addEventListener("arcgisViewLayerviewCreateError", onLayerViewCreateError as EventListener);
  document.addEventListener("arcgisViewChange", onViewChange as EventListener);
  window.addEventListener("online", onOnline);

  return () => {
    window.clearTimeout(auditTimer);
    document.removeEventListener("arcgisViewLayerviewCreate", onLayerViewCreate as EventListener);
    document.removeEventListener("arcgisViewLayerviewDestroy", onLayerViewDestroy as EventListener);
    document.removeEventListener("arcgisViewLayerviewCreateError", onLayerViewCreateError as EventListener);
    document.removeEventListener("arcgisViewChange", onViewChange as EventListener);
    window.removeEventListener("online", onOnline);
    layerViews.clear();
    scaleRepairCounts.clear();
    recycleCounts.clear();
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

function recycleLayer(scene: SceneLike, layer: LayerLike): void {
  if (!scene.isConnected || layer.visible === false || !scene.map) return;
  const map = scene.map;
  const currentIndex = map.layers?.indexOf?.(layer) ?? -1;
  try {
    map.remove(layer);
    queueMicrotask(() => {
      if (!scene.isConnected || layer.visible === false) return;
      try {
        if (currentIndex >= 0) map.add(layer, currentIndex);
        else map.add(layer);
      } catch {
        // The existing runtime retry/failover path remains the final recovery layer.
      }
    });
  } catch {
    // A concurrent hide/reload may already have detached the layer.
  }
}

function clampInterior(value: number, minScale?: number, maxScale?: number): number {
  let next = Math.max(1, value);
  if (minScale && next >= minScale) next = Math.max(1, Math.round(minScale * (1 - SCALE_REPAIR_INSET)));
  if (maxScale && next <= maxScale) next = Math.round(maxScale * (1 + SCALE_REPAIR_INSET));
  if (minScale && maxScale && (next >= minScale || next <= maxScale)) {
    return Math.max(1, Math.round(Math.sqrt(minScale * maxScale)));
  }
  return next;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [record.name, record.message, record.details]
      .filter((value) => typeof value === "string")
      .join(" ");
  }
  return "";
}
