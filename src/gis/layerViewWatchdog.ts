import { runtimeScaleRangeFromLoadedLayer } from "../lib/runtimeScale";

const MAIN_SCENE_ID = "altyapi-main-scene";
const SCALE_REPAIR_INSET = 0.04;
const SCALE_REPAIR_COOLDOWN_MS = 240;
const SCALE_REPAIR_RECHECK_MS = 280;
const MAX_SCALE_REPAIRS_PER_VIOLATION = 2;
const MAX_LAYER_VIEW_RECYCLES = 2;
const LAYER_VIEW_RECYCLE_DELAYS_MS = [320, 900] as const;

type Removable = { remove(): void };

type LayerLike = {
  id?: string;
  visible?: boolean;
  minScale?: unknown;
  maxScale?: unknown;
  sublayers?: unknown;
};

type WatchableProperty = "visibleAtCurrentScale" | "updating" | "visible";

type LayerViewLike = {
  layer?: LayerLike;
  visible?: boolean;
  visibleAtCurrentScale?: boolean;
  suspended?: boolean;
  updating?: boolean;
  watch?: (property: WatchableProperty, callback: (value: unknown) => void) => Removable;
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

export type LayerViewHealthPhase =
  | "created"
  | "stable"
  | "scale-repair"
  | "recycle-attempt"
  | "recovery-exhausted"
  | "destroyed";

export interface LayerViewHealthDetail {
  phase: LayerViewHealthPhase;
  layerId: string;
  serviceId: string;
  attempt?: number;
  targetScale?: number;
}

export interface LayerViewScaleIntersection {
  minScale?: number;
  maxScale?: number;
  constrainedLayerIds: string[];
  violatingLayerIds: string[];
  conflict: boolean;
}

export function layerViewScaleIntersection(layerViews: Iterable<LayerViewLike>): LayerViewScaleIntersection {
  const minScales: number[] = [];
  const maxScales: number[] = [];
  const constrainedLayerIds: string[] = [];
  const violatingLayerIds: string[] = [];

  for (const layerView of layerViews) {
    const layer = layerView.layer;
    const layerId = layer?.id;
    if (!layerId?.startsWith("svc-")) continue;
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

  if (minScale && maxScale) return Math.max(1, Math.round(Math.sqrt(minScale * maxScale)));
  if (minScale) return Math.max(1, Math.round(minScale * 0.78));
  if (maxScale) return Math.max(1, Math.round(maxScale * 1.3));
  return undefined;
}

export function isLayerViewRenderStable(layerView: Pick<LayerViewLike, "visible" | "visibleAtCurrentScale" | "updating">): boolean {
  return layerView.visible !== false && layerView.visibleAtCurrentScale !== false && layerView.updating === false;
}

export function layerViewRecoveryDelayMs(attempt: number): number {
  const index = Math.max(0, Math.min(LAYER_VIEW_RECYCLE_DELAYS_MS.length - 1, Math.trunc(attempt) - 1));
  return LAYER_VIEW_RECYCLE_DELAYS_MS[index]!;
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
 * Uses ArcGIS LayerView state as the final render truth signal. Accessor watches
 * are attached when available, so scale visibility and first-render readiness
 * are observed immediately without polling. Hidden layers are ignored and all
 * watches are detached when their LayerView is destroyed.
 */
export function installSceneLayerWatchdog(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const layerViews = new Map<string, LayerViewLike>();
  const layerViewHandles = new Map<string, Removable[]>();
  const stableLayerIds = new Set<string>();
  const scaleRepairCounts = new Map<string, number>();
  const recycleCounts = new Map<string, number>();
  let auditTimer = 0;
  let lastScaleRepairAt = 0;

  const emitHealth = (layerId: string, phase: LayerViewHealthPhase, extra: Partial<LayerViewHealthDetail> = {}) => {
    const serviceId = serviceIdFromLayerId(layerId);
    if (!serviceId) return;
    window.dispatchEvent(new CustomEvent<LayerViewHealthDetail>("altyapi:layerview-health", {
      detail: { phase, layerId, serviceId, ...extra }
    }));
  };

  const clearLayerViewHandles = (layerId: string) => {
    for (const handle of layerViewHandles.get(layerId) ?? []) {
      try { handle.remove(); } catch { /* ArcGIS teardown is best-effort */ }
    }
    layerViewHandles.delete(layerId);
  };

  const markStable = (layerId: string, layerView: LayerViewLike) => {
    if (!isLayerViewRenderStable(layerView) || stableLayerIds.has(layerId)) return;
    stableLayerIds.add(layerId);
    recycleCounts.delete(layerId);
    scaleRepairCounts.delete(layerId);
    emitHealth(layerId, "stable");
  };

  const scheduleAudit = (scene: SceneLike, delay = 80) => {
    window.clearTimeout(auditTimer);
    auditTimer = window.setTimeout(() => audit(scene), delay);
  };

  const attachLayerViewWatches = (scene: SceneLike, layerId: string, layerView: LayerViewLike) => {
    clearLayerViewHandles(layerId);
    const handles: Removable[] = [];
    if (typeof layerView.watch === "function") {
      try {
        handles.push(layerView.watch("visibleAtCurrentScale", () => {
          stableLayerIds.delete(layerId);
          markStable(layerId, layerView);
          scheduleAudit(scene, 30);
        }));
        handles.push(layerView.watch("updating", () => {
          markStable(layerId, layerView);
          scheduleAudit(scene, 45);
        }));
        handles.push(layerView.watch("visible", () => {
          stableLayerIds.delete(layerId);
          markStable(layerId, layerView);
          scheduleAudit(scene, 30);
        }));
      } catch {
        for (const handle of handles) {
          try { handle.remove(); } catch { /* best-effort */ }
        }
        handles.length = 0;
      }
    }
    if (handles.length) layerViewHandles.set(layerId, handles);
    markStable(layerId, layerView);
  };

  const audit = (scene: SceneLike) => {
    if (!scene.isConnected) return;

    for (const [layerId, layerView] of layerViews) {
      if (layerView.visibleAtCurrentScale !== false || layerView.layer?.visible === false || layerView.visible === false) {
        scaleRepairCounts.delete(layerId);
      }
      markStable(layerId, layerView);
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
      stableLayerIds.delete(layerId);
      scaleRepairCounts.set(layerId, (scaleRepairCounts.get(layerId) ?? 0) + 1);
      emitHealth(layerId, "scale-repair", { targetScale });
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
    stableLayerIds.delete(layerId);
    scaleRepairCounts.delete(layerId);
    emitHealth(layerId, "created");
    attachLayerViewWatches(scene, layerId, layerView);
    scheduleAudit(scene, 40);
  };

  const onLayerViewDestroy = (event: Event) => {
    const detail = customDetail(event);
    const layerId = detail?.layerView?.layer?.id ?? detail?.layer?.id;
    if (!layerId?.startsWith("svc-")) return;
    clearLayerViewHandles(layerId);
    layerViews.delete(layerId);
    stableLayerIds.delete(layerId);
    scaleRepairCounts.delete(layerId);
    emitHealth(layerId, "destroyed");
  };

  const onLayerViewCreateError = (event: Event) => {
    const scene = sceneFromEvent(event);
    if (!scene) return;
    const detail = customDetail(event);
    const layer = detail?.layer;
    const layerId = layer?.id;
    if (!layerId?.startsWith("svc-") || layer.visible === false) return;
    if (!shouldRecycleLayerView(detail?.error)) return;

    const recycleCount = recycleCounts.get(layerId) ?? 0;
    if (recycleCount >= MAX_LAYER_VIEW_RECYCLES) {
      emitHealth(layerId, "recovery-exhausted", { attempt: recycleCount });
      return;
    }

    const attempt = recycleCount + 1;
    recycleCounts.set(layerId, attempt);
    stableLayerIds.delete(layerId);
    emitHealth(layerId, "recycle-attempt", { attempt });
    window.setTimeout(() => recycleLayer(scene, layer), layerViewRecoveryDelayMs(attempt));
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
    for (const layerId of [...layerViewHandles.keys()]) clearLayerViewHandles(layerId);
    layerViews.clear();
    stableLayerIds.clear();
    scaleRepairCounts.clear();
    recycleCounts.clear();
  };
}

function serviceIdFromLayerId(layerId: string): string | undefined {
  return layerId.startsWith("svc-") && layerId.length > 4 ? layerId.slice(4) : undefined;
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
