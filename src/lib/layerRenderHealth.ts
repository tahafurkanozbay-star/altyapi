import {
  publishRuntimeEvent,
  subscribeRuntimeEvent,
  type LayerRenderHealthEventDetail,
  type LayerRenderHealthPhase
} from "../platform/runtimeEvents";
import { asRecord, readEnum, readFiniteNumber, readString } from "../platform/runtimeContracts";

export type { LayerRenderHealthPhase } from "../platform/runtimeEvents";
export type LayerRenderHealthDetail = LayerRenderHealthEventDetail;

export type LayerRenderState =
  | "preparing"
  | "ready"
  | "scale-adjusting"
  | "stalled"
  | "recovering"
  | "failed";

export interface LayerRenderHealthState {
  state: LayerRenderState;
  attempt?: number;
  targetScale?: number;
  elapsedMs?: number;
  updatedAt: number;
}

export type LayerRenderHealthSnapshot = Readonly<Record<string, LayerRenderHealthState>>;

const PHASES = new Set<LayerRenderHealthPhase>([
  "created",
  "stable",
  "scale-repair",
  "render-stalled",
  "recycle-attempt",
  "render-failed",
  "recovery-exhausted",
  "destroyed"
]);
const EMPTY_SNAPSHOT: LayerRenderHealthSnapshot = Object.freeze({});

let snapshot: LayerRenderHealthSnapshot = EMPTY_SNAPSHOT;
let detachObserver: (() => void) | null = null;
const subscribers = new Set<() => void>();

export function installLayerRenderHealthStore(): () => void {
  if (detachObserver) return detachObserver;

  detachObserver = subscribeRuntimeEvent("layer-render-health", (detail) => {
    applyLayerRenderHealth(detail);
  });

  const detach = detachObserver;
  detachObserver = () => {
    detach();
    detachObserver = null;
    if (snapshot !== EMPTY_SNAPSHOT) {
      snapshot = EMPTY_SNAPSHOT;
      notifySubscribers();
    }
  };
  return detachObserver;
}

export function subscribeLayerRenderHealth(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function getLayerRenderHealthSnapshot(): LayerRenderHealthSnapshot {
  return snapshot;
}

export function getServerLayerRenderHealthSnapshot(): LayerRenderHealthSnapshot {
  return EMPTY_SNAPSHOT;
}

export function setLayerRenderHealthPreparing(serviceId: string, now = Date.now()): void {
  if (!serviceId.trim()) return;
  commitServiceState(serviceId, { state: "preparing", updatedAt: now });
}

export function pruneLayerRenderHealth(visibleServiceIds: ReadonlySet<string>): void {
  const next = retainVisibleRenderHealth(snapshot, visibleServiceIds);
  if (next !== snapshot) {
    snapshot = next;
    notifySubscribers();
  }
}

/**
 * Defensive parser retained for external/diagnostic boundaries. Internal
 * producers use the typed runtime bus and therefore never need to cast a
 * window CustomEvent payload back into domain state.
 */
export function parseLayerRenderHealthDetail(value: unknown): LayerRenderHealthDetail | null {
  const record = asRecord(value);
  if (!record) return null;

  const phase = readEnum(record, "phase", PHASES);
  const layerId = readString(record, "layerId", { nonEmpty: true });
  const serviceId = readString(record, "serviceId", { trim: true, nonEmpty: true });
  if (!phase || !layerId?.startsWith("svc-") || layerId.length <= 4 || !serviceId) return null;
  if (layerId !== `svc-${serviceId}`) return null;

  const attempt = positiveInteger(readFiniteNumber(record, "attempt"));
  const targetScale = positiveFinite(readFiniteNumber(record, "targetScale"));
  const elapsedMs = positiveFinite(readFiniteNumber(record, "elapsedMs"));

  return {
    phase,
    layerId,
    serviceId,
    ...(attempt !== undefined ? { attempt } : {}),
    ...(targetScale !== undefined ? { targetScale } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {})
  };
}

export function reduceLayerRenderHealth(
  current: LayerRenderHealthState | undefined,
  detail: LayerRenderHealthDetail,
  now = Date.now()
): LayerRenderHealthState | undefined {
  const base = {
    updatedAt: now,
    ...(detail.attempt !== undefined ? { attempt: detail.attempt } : {}),
    ...(detail.targetScale !== undefined ? { targetScale: detail.targetScale } : {}),
    ...(detail.elapsedMs !== undefined ? { elapsedMs: detail.elapsedMs } : {})
  };

  switch (detail.phase) {
    case "created":
      return { state: "preparing", updatedAt: now };
    case "stable":
      return { state: "ready", updatedAt: now };
    case "scale-repair":
      return { state: "scale-adjusting", ...base };
    case "render-stalled":
      return { state: "stalled", ...base };
    case "recycle-attempt":
      return { state: "recovering", ...base };
    case "render-failed":
      return { state: "failed", updatedAt: now };
    case "recovery-exhausted":
      return {
        state: "failed",
        updatedAt: now,
        attempt: detail.attempt ?? current?.attempt
      };
    case "destroyed":
      return undefined;
  }
}

export function layerRenderHealthLabel(state: LayerRenderHealthState | undefined): string | null {
  if (!state) return null;
  if (state.state === "preparing") return "Render hazırlanıyor";
  if (state.state === "ready") return "Hazır";
  if (state.state === "scale-adjusting") return state.targetScale
    ? `Ölçek ayarlanıyor · 1:${formatScale(state.targetScale)}`
    : "Ölçek ayarlanıyor";
  if (state.state === "stalled") return state.elapsedMs
    ? `Render gecikti · ${Math.max(1, Math.round(state.elapsedMs / 1_000))} sn`
    : "Render gecikti";
  if (state.state === "recovering") return state.attempt
    ? `Render kurtarılıyor · ${state.attempt}. deneme`
    : "Render kurtarılıyor";
  return "Render başarısız";
}

export function layerRenderHealthVisualStatus(
  state: LayerRenderHealthState | undefined
): "ready" | "loading" | "error" | undefined {
  if (!state) return undefined;
  if (state.state === "ready") return "ready";
  if (state.state === "failed") return "error";
  return "loading";
}

export function isLayerRenderFailure(state: LayerRenderHealthState | undefined): boolean {
  return state?.state === "failed";
}

export function retainVisibleRenderHealth(
  current: LayerRenderHealthSnapshot,
  visibleServiceIds: ReadonlySet<string>
): LayerRenderHealthSnapshot {
  let changed = false;
  const next: Record<string, LayerRenderHealthState> = {};
  for (const [serviceId, state] of Object.entries(current)) {
    if (visibleServiceIds.has(serviceId)) next[serviceId] = state;
    else changed = true;
  }
  return changed ? next : current;
}

/** Public typed producer for tests and non-ArcGIS runtime adapters. */
export function publishLayerRenderHealth(detail: LayerRenderHealthDetail): void {
  publishRuntimeEvent("layer-render-health", detail);
}

function applyLayerRenderHealth(detail: LayerRenderHealthDetail): void {
  const nextState = reduceLayerRenderHealth(snapshot[detail.serviceId], detail);
  if (!nextState) {
    if (!(detail.serviceId in snapshot)) return;
    const next = { ...snapshot };
    delete next[detail.serviceId];
    snapshot = next;
    notifySubscribers();
    return;
  }
  commitServiceState(detail.serviceId, nextState);
}

function commitServiceState(serviceId: string, state: LayerRenderHealthState): void {
  const previous = snapshot[serviceId];
  if (
    previous?.state === state.state &&
    previous.attempt === state.attempt &&
    previous.targetScale === state.targetScale &&
    previous.elapsedMs === state.elapsedMs
  ) return;
  snapshot = { ...snapshot, [serviceId]: state };
  notifySubscribers();
}

function notifySubscribers(): void {
  for (const listener of subscribers) listener();
}

function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}

function positiveFinite(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

function formatScale(value: number): string {
  return Math.round(value).toLocaleString("tr-TR");
}
