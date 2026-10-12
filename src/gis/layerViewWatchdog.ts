import { watch as reactiveWatch } from "@arcgis/core/core/reactiveUtils.js";
import { runtimeScaleRangeFromLoadedLayer } from "../lib/runtimeScale";
import { getRuntimePressureSnapshot, type RuntimePressureLevel } from "../platform/runtimePressure";
import { FirstRenderProbe, waitForRenderFrames } from "./firstRenderProbe";
import {
  ATOMIC_LAYER_ACTIVATION_EVENT,
  isAtomicLayerActivationPending
} from "./layerActivationState";

const MAIN_SCENE_ID = "altyapi-main-scene";
const SCALE_REPAIR_INSET = 0.04;
const SCALE_REPAIR_COOLDOWN_MS = 240;
const SCALE_REPAIR_RECHECK_MS = 280;
const MAX_SCALE_REPAIRS_PER_VIOLATION = 2;
const MAX_LAYER_VIEW_RECYCLES = 2;
const LAYER_VIEW_RECYCLE_DELAYS_MS = [320, 900] as const;
const DEFAULT_RENDER_STALL_TIMEOUT_MS = 25_000;
const STALL_PRESSURE_RECHECK_MS = 2_000;
const SCENE_UPDATE_GRACE_MS = 45_000;
const MAX_STALL_GRACE_MS = 90_000;

type Removable = { remove(): void };

type LayerLike = {
  id?: string;
  type?: unknown;
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
  dataUpdating?: boolean;
  hasAllFeaturesInView?: boolean;
  queryFeatureCount?: (query?: { geometry?: unknown }, options?: { signal?: AbortSignal }) => Promise<number>;
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
  stationary?: boolean;
  updating?: boolean;
  extent?: ViewExtent | null;
  map?: MapLike | null;
};

interface ViewExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  clone?(): ViewExtent;
}

export function sameViewExtent(left: ViewExtent | null | undefined, right: ViewExtent | null | undefined): boolean {
  return Boolean(left && right && ["xmin", "ymin", "xmax", "ymax"].every((key) => {
    const field = key as keyof Pick<ViewExtent, "xmin" | "ymin" | "xmax" | "ymax">;
    return Number.isFinite(left[field]) && left[field] === right[field];
  }));
}

export function canProbeFirstRender(layerView: LayerViewLike): boolean {
  return layerView.layer?.visible !== false && isLayerViewRenderable(layerView)
    && layerView.updating === true && layerView.dataUpdating === false
    && layerView.hasAllFeaturesInView !== false && typeof layerView.queryFeatureCount === "function";
}

export interface LayerViewRecoveryContext {
  stationary?: boolean;
  updating?: boolean;
}

export type LayerViewHealthPhase =
  | "created"
  | "stable"
  | "scale-repair"
  | "render-stalled"
  | "recycle-attempt"
  | "render-failed"
  | "recovery-exhausted"
  | "destroyed";

export interface LayerViewHealthDetail {
  phase: LayerViewHealthPhase;
  layerId: string;
  serviceId: string;
  attempt?: number;
  targetScale?: number;
  elapsedMs?: number;
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

export function isLayerViewRenderable(
  layerView: Pick<LayerViewLike, "visible" | "visibleAtCurrentScale" | "suspended">
): boolean {
  return layerView.visible !== false && layerView.visibleAtCurrentScale !== false && layerView.suspended !== true;
}

export function isLayerViewRenderStable(
  layerView: Pick<LayerViewLike, "visible" | "visibleAtCurrentScale" | "updating" | "suspended">
): boolean {
  return isLayerViewRenderable(layerView) && layerView.updating === false;
}

/**
 * ArcGIS FeatureLayerView can keep `updating=true` while it streams/refines
 * additional tiles even after real features are queryable and already painted.
 * Before destructive recycle, use queryability as positive evidence that the
 * first render is usable instead of treating background refinement as failure.
 */
export async function layerViewHasRenderableData(
  layerView: Pick<LayerViewLike, "visible" | "visibleAtCurrentScale" | "suspended" | "queryFeatureCount">,
  geometry?: unknown,
  signal?: AbortSignal
): Promise<boolean> {
  if (!isLayerViewRenderable(layerView) || typeof layerView.queryFeatureCount !== "function") return false;
  try {
    const count = await layerView.queryFeatureCount(geometry ? { geometry } : undefined, signal ? { signal } : undefined);
    return !signal?.aborted && isLayerViewRenderable(layerView) && Number.isFinite(count) && count > 0;
  } catch {
    return false;
  }
}

export function layerViewStallTimeoutMs(layer?: Pick<LayerLike, "type">): number {
  const type = typeof layer?.type === "string" ? layer.type.toLocaleLowerCase("en-US") : "";
  if (type.includes("scene")) return 35_000;
  if (type.includes("map-image") || type.includes("mapimage")) return 28_000;
  if (type.includes("wms")) return 24_000;
  if (type.includes("wfs") || type.includes("feature")) return 26_000;
  return DEFAULT_RENDER_STALL_TIMEOUT_MS;
}

export function isLayerViewStalled(
  layerView: LayerViewLike,
  elapsedMs: number,
  timeoutMs = layerViewStallTimeoutMs(layerView.layer)
): boolean {
  if (!Number.isFinite(elapsedMs) || elapsedMs < timeoutMs) return false;
  if (layerView.layer?.visible === false || layerView.visible === false || layerView.visibleAtCurrentScale === false) return false;
  return !isLayerViewRenderStable(layerView);
}

export function shouldDeferLayerViewRecovery(
  scene: LayerViewRecoveryContext,
  pressureLevel: RuntimePressureLevel,
  elapsedMs: number
): boolean {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= MAX_STALL_GRACE_MS) return false;
  if (scene.stationary === false || pressureLevel !== "normal") return true;
  return scene.updating === true && elapsedMs < SCENE_UPDATE_GRACE_MS;
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
 * are observed immediately without polling. During runtime-owned atomic layer
 * activation the watchdog observes health but defers scale repair; once the
 * transaction completes it re-audits and becomes the continuous recovery net.
 */
export function installSceneLayerWatchdog(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const layerViews = new Map<string, LayerViewLike>();
  const layerViewHandles = new Map<string, Removable[]>();
  const stallTimers = new Map<string, number>();
  const renderStartedAt = new Map<string, number>();
  const stableLayerIds = new Set<string>();
  const dataReadyLayerIds = new Set<string>();
  const scaleRepairCounts = new Map<string, number>();
  const recycleCounts = new Map<string, number>();
  const recyclePending = new Set<string>();
  const recycleTimers = new Set<number>();
  let disposed = false;
  let auditTimer = 0;
  let lastScaleRepairAt = 0;

  const emitHealth = (layerId: string, phase: LayerViewHealthPhase, extra: Partial<LayerViewHealthDetail> = {}) => {
    const serviceId = serviceIdFromLayerId(layerId);
    if (!serviceId) return;
    window.dispatchEvent(new CustomEvent<LayerViewHealthDetail>("altyapi:layerview-health", {
      detail: { phase, layerId, serviceId, ...extra }
    }));
  };

  const clearStallTimer = (layerId: string) => {
    const timer = stallTimers.get(layerId);
    if (timer !== undefined) window.clearTimeout(timer);
    stallTimers.delete(layerId);
  };

  const clearLayerViewHandles = (layerId: string) => {
    for (const handle of layerViewHandles.get(layerId) ?? []) {
      try { handle.remove(); } catch { /* ArcGIS teardown is best-effort */ }
    }
    layerViewHandles.delete(layerId);
  };

  const markStable = (layerId: string, layerView: LayerViewLike) => {
    const renderReady = isLayerViewRenderStable(layerView)
      || (dataReadyLayerIds.has(layerId) && isLayerViewRenderable(layerView));
    if (disposed || layerView.layer?.visible === false || !renderReady || stableLayerIds.has(layerId)) return;
    const startedAt = renderStartedAt.get(layerId);
    stableLayerIds.add(layerId);
    clearStallTimer(layerId);
    renderStartedAt.delete(layerId);
    recyclePending.delete(layerId);
    recycleCounts.delete(layerId);
    scaleRepairCounts.delete(layerId);
    emitHealth(layerId, "stable", startedAt !== undefined ? { elapsedMs: Math.max(0, Date.now() - startedAt) } : {});
  };

  const scheduleAudit = (scene: SceneLike, delay = 80) => {
    if (disposed) return;
    window.clearTimeout(auditTimer);
    auditTimer = window.setTimeout(() => audit(scene), delay);
  };

  const firstRender = new FirstRenderProbe<{ scene: SceneLike; layerView: LayerViewLike; extent: ViewExtent }>({
    same: (left, right) => left.layerView === right.layerView && sameViewExtent(left.extent, right.extent),
    isCurrent: (layerId, value) => !disposed && !document.hidden && value.scene.isConnected
      && layerViews.get(layerId) === value.layerView && canProbeFirstRender(value.layerView)
      && sameViewExtent(value.extent, value.scene.extent),
    read: async ({ layerView, extent }, signal) => {
      if (!await layerViewHasRenderableData(layerView, extent, signal)) return false;
      return waitForRenderFrames(signal);
    },
    onReady: (layerId, { layerView }) => {
      dataReadyLayerIds.add(layerId);
      markStable(layerId, layerView);
    }
  });
  const probeFirstRender = (scene: SceneLike, layerId: string, layerView: LayerViewLike) => {
    if (stableLayerIds.has(layerId) || !canProbeFirstRender(layerView) || !scene.extent) return;
    const extent = scene.extent.clone?.() ?? { ...scene.extent };
    void firstRender.request(layerId, { scene, layerView, extent });
  };

  const requestRecycle = (scene: SceneLike, layerId: string, layer: LayerLike) => {
    if (disposed || layer.visible === false) return;
    const recycleCount = recycleCounts.get(layerId) ?? 0;
    if (recycleCount >= MAX_LAYER_VIEW_RECYCLES) {
      recyclePending.delete(layerId);
      renderStartedAt.delete(layerId);
      emitHealth(layerId, "recovery-exhausted", { attempt: recycleCount });
      return;
    }

    const attempt = recycleCount + 1;
    recycleCounts.set(layerId, attempt);
    recyclePending.add(layerId);
    stableLayerIds.delete(layerId);
    dataReadyLayerIds.delete(layerId);
    firstRender.cancel(layerId);
    clearStallTimer(layerId);
    emitHealth(layerId, "recycle-attempt", { attempt });

    const recycleTimer = window.setTimeout(() => {
      recycleTimers.delete(recycleTimer);
      if (disposed || layer.visible === false || !scene.isConnected) {
        recyclePending.delete(layerId);
        return;
      }
      const scheduled = recycleLayer(scene, layer, () => {
        if (layer.visible === false) return;
        recyclePending.delete(layerId);
        renderStartedAt.delete(layerId);
        emitHealth(layerId, "recovery-exhausted", { attempt });
      }, () => !disposed);
      if (!scheduled) {
        recyclePending.delete(layerId);
        renderStartedAt.delete(layerId);
        emitHealth(layerId, "recovery-exhausted", { attempt });
      }
    }, layerViewRecoveryDelayMs(attempt));
    recycleTimers.add(recycleTimer);
  };

  const armStallTimer = (
    scene: SceneLike,
    layerId: string,
    layerView: LayerViewLike,
    requestedDelayMs?: number
  ) => {
    clearStallTimer(layerId);
    if (stableLayerIds.has(layerId)) return;
    if (layerView.layer?.visible === false || layerView.visible === false || layerView.visibleAtCurrentScale === false) return;

    const timeoutMs = layerViewStallTimeoutMs(layerView.layer);
    const startedAt = renderStartedAt.get(layerId) ?? Date.now();
    renderStartedAt.set(layerId, startedAt);
    const elapsedBeforeArm = Math.max(0, Date.now() - startedAt);
    const delayMs = requestedDelayMs ?? Math.max(250, timeoutMs - elapsedBeforeArm);

    const timer = window.setTimeout(() => {
      stallTimers.delete(layerId);
      if (layerViews.get(layerId) !== layerView) return;
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      if (!isLayerViewStalled(layerView, elapsedMs, timeoutMs)) return;

      const pressure = getRuntimePressureSnapshot().level;
      if (shouldDeferLayerViewRecovery(scene, pressure, elapsedMs)) {
        armStallTimer(scene, layerId, layerView, STALL_PRESSURE_RECHECK_MS);
        return;
      }

      // A FeatureLayerView may continue reporting `updating=true` while
      // background tiles refine even though features are already queryable and
      // visible. Prove usable data before any destructive map remove/add cycle.
      void layerViewHasRenderableData(layerView).then((hasRenderableData) => {
        if (disposed || layerView.layer?.visible === false || layerViews.get(layerId) !== layerView || stableLayerIds.has(layerId)) return;
        if (hasRenderableData) {
          dataReadyLayerIds.add(layerId);
          markStable(layerId, layerView);
          return;
        }

        emitHealth(layerId, "render-stalled", { elapsedMs });
        const layer = layerView.layer;
        if (layer) requestRecycle(scene, layerId, layer);
        else {
          renderStartedAt.delete(layerId);
          emitHealth(layerId, "render-failed");
        }
      });
    }, delayMs);
    stallTimers.set(layerId, timer);
  };

  const attachLayerViewWatches = (scene: SceneLike, layerId: string, layerView: LayerViewLike) => {
    clearLayerViewHandles(layerId);
    const handles: Removable[] = [];

    try {
      handles.push(reactiveWatch(
        () => [
          layerView.visibleAtCurrentScale,
          layerView.updating,
          layerView.suspended,
          layerView.visible,
          layerView.layer?.visible,
          layerView.dataUpdating,
          layerView.hasAllFeaturesInView
        ] as const,
        () => {
          if (layerView.dataUpdating === true || !isLayerViewRenderable(layerView) || layerView.layer?.visible === false) {
            dataReadyLayerIds.delete(layerId);
            firstRender.cancel(layerId);
          }
          const stable = layerView.layer?.visible !== false && (
            isLayerViewRenderStable(layerView)
            || (dataReadyLayerIds.has(layerId) && isLayerViewRenderable(layerView))
          );
          if (!stable && stableLayerIds.delete(layerId)) emitHealth(layerId, "created");

          if (layerView.layer?.visible === false || layerView.visible === false || layerView.visibleAtCurrentScale === false) {
            dataReadyLayerIds.delete(layerId);
            clearStallTimer(layerId);
          } else if (!stable) {
            if (!renderStartedAt.has(layerId)) renderStartedAt.set(layerId, Date.now());
            armStallTimer(scene, layerId, layerView);
          }

          markStable(layerId, layerView);
          probeFirstRender(scene, layerId, layerView);
          scheduleAudit(scene, 35);
        },
        { initial: true }
      ));
    } catch {
      for (const handle of handles) {
        try { handle.remove(); } catch { /* best-effort */ }
      }
      handles.length = 0;
    }

    if (handles.length) layerViewHandles.set(layerId, handles);
    markStable(layerId, layerView);
    if (!stableLayerIds.has(layerId)) armStallTimer(scene, layerId, layerView);
  };

  const audit = (scene: SceneLike) => {
    if (!scene.isConnected) return;

    for (const [layerId, layerView] of layerViews) {
      if (layerView.visibleAtCurrentScale !== false || layerView.layer?.visible === false || layerView.visible === false) {
        scaleRepairCounts.delete(layerId);
      }
      if (layerView.visibleAtCurrentScale === false) clearStallTimer(layerId);
      markStable(layerId, layerView);
      probeFirstRender(scene, layerId, layerView);
    }

    const state = layerViewScaleIntersection(layerViews.values());
    if (state.violatingLayerIds.length === 0 || state.conflict) return;

    // The runtime owns the only activation camera decision. A LayerView can be
    // created before that decision is committed, so never race it with an
    // independent scene.scale write. The completion event below schedules a
    // fresh audit immediately after the atomic transaction ends.
    if (state.violatingLayerIds.some((layerId) => isAtomicLayerActivationPending(layerId))) return;

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
      clearStallTimer(layerId);
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
    const recovering = recyclePending.delete(layerId);
    layerViews.set(layerId, layerView);
    if (!renderStartedAt.has(layerId)) renderStartedAt.set(layerId, Date.now());
    stableLayerIds.delete(layerId);
    dataReadyLayerIds.delete(layerId);
    scaleRepairCounts.delete(layerId);
    if (!recovering) emitHealth(layerId, "created");
    attachLayerViewWatches(scene, layerId, layerView);
    scheduleAudit(scene, 40);
  };

  const onLayerViewDestroy = (event: Event) => {
    const detail = customDetail(event);
    const layer = detail?.layerView?.layer ?? detail?.layer;
    const layerId = layer?.id;
    if (!layerId?.startsWith("svc-")) return;
    const recovering = recyclePending.has(layerId) && layer?.visible !== false;
    clearLayerViewHandles(layerId);
    clearStallTimer(layerId);
    firstRender.cancel(layerId);
    layerViews.delete(layerId);
    stableLayerIds.delete(layerId);
    dataReadyLayerIds.delete(layerId);
    scaleRepairCounts.delete(layerId);
    if (!recovering) {
      recyclePending.delete(layerId);
      recycleCounts.delete(layerId);
      renderStartedAt.delete(layerId);
      emitHealth(layerId, "destroyed");
    }
  };

  const onLayerViewCreateError = (event: Event) => {
    const scene = sceneFromEvent(event);
    if (!scene) return;
    const detail = customDetail(event);
    const layer = detail?.layer;
    const layerId = layer?.id;
    if (!layer || !layerId?.startsWith("svc-") || layer.visible === false) return;
    clearStallTimer(layerId);

    if (!shouldRecycleLayerView(detail?.error)) {
      recyclePending.delete(layerId);
      renderStartedAt.delete(layerId);
      emitHealth(layerId, "render-failed");
      return;
    }
    requestRecycle(scene, layerId, layer);
  };

  const onViewChange = (event: Event) => {
    const scene = sceneFromEvent(event);
    if (scene) scheduleAudit(scene);
  };

  const onOnline = () => {
    const scene = document.getElementById(MAIN_SCENE_ID) as SceneLike | null;
    if (scene) scheduleAudit(scene, 120);
  };

  const onAtomicActivationComplete = () => {
    const scene = document.getElementById(MAIN_SCENE_ID) as SceneLike | null;
    if (scene) scheduleAudit(scene, 30);
  };

  document.addEventListener("arcgisViewLayerviewCreate", onLayerViewCreate as EventListener);
  document.addEventListener("arcgisViewLayerviewDestroy", onLayerViewDestroy as EventListener);
  document.addEventListener("arcgisViewLayerviewCreateError", onLayerViewCreateError as EventListener);
  document.addEventListener("arcgisViewChange", onViewChange as EventListener);
  window.addEventListener("online", onOnline);
  window.addEventListener(ATOMIC_LAYER_ACTIVATION_EVENT, onAtomicActivationComplete);

  return () => {
    disposed = true;
    firstRender.dispose();
    for (const timer of recycleTimers) window.clearTimeout(timer);
    recycleTimers.clear();
    window.clearTimeout(auditTimer);
    document.removeEventListener("arcgisViewLayerviewCreate", onLayerViewCreate as EventListener);
    document.removeEventListener("arcgisViewLayerviewDestroy", onLayerViewDestroy as EventListener);
    document.removeEventListener("arcgisViewLayerviewCreateError", onLayerViewCreateError as EventListener);
    document.removeEventListener("arcgisViewChange", onViewChange as EventListener);
    window.removeEventListener("online", onOnline);
    window.removeEventListener(ATOMIC_LAYER_ACTIVATION_EVENT, onAtomicActivationComplete);
    for (const layerId of [...layerViewHandles.keys()]) clearLayerViewHandles(layerId);
    for (const layerId of [...stallTimers.keys()]) clearStallTimer(layerId);
    renderStartedAt.clear();
    layerViews.clear();
    stableLayerIds.clear();
    dataReadyLayerIds.clear();
    scaleRepairCounts.clear();
    recycleCounts.clear();
    recyclePending.clear();
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

function recycleLayer(scene: SceneLike, layer: LayerLike, onFailure: () => void, isAlive: () => boolean): boolean {
  if (!scene.isConnected || layer.visible === false || !scene.map) return false;
  const map = scene.map;
  const currentIndex = map.layers?.indexOf?.(layer) ?? -1;
  try {
    map.remove(layer);
    queueMicrotask(() => {
      // Reattach a layer hidden during recovery so the runtime's cached layer
      // remains reusable. Reattachment preserves its current visibility.
      if (!scene.isConnected || !isAlive()) return;
      try {
        if (currentIndex >= 0) map.add(layer, currentIndex);
        else map.add(layer);
      } catch {
        onFailure();
      }
    });
    return true;
  } catch {
    return false;
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
