export type LayerRenderHealthPhase =
  | "created"
  | "stable"
  | "scale-repair"
  | "recycle-attempt"
  | "recovery-exhausted"
  | "destroyed";

export type LayerRenderState =
  | "preparing"
  | "ready"
  | "scale-adjusting"
  | "recovering"
  | "failed";

export interface LayerRenderHealthDetail {
  phase: LayerRenderHealthPhase;
  layerId: string;
  serviceId: string;
  attempt?: number;
  targetScale?: number;
}

export interface LayerRenderHealthState {
  state: LayerRenderState;
  attempt?: number;
  targetScale?: number;
  updatedAt: number;
}

export type LayerRenderHealthSnapshot = Readonly<Record<string, LayerRenderHealthState>>;

const PHASES = new Set<LayerRenderHealthPhase>([
  "created",
  "stable",
  "scale-repair",
  "recycle-attempt",
  "recovery-exhausted",
  "destroyed"
]);
const EMPTY_SNAPSHOT: LayerRenderHealthSnapshot = Object.freeze({});

let snapshot: LayerRenderHealthSnapshot = EMPTY_SNAPSHOT;
let detachObserver: (() => void) | null = null;
const subscribers = new Set<() => void>();

export function installLayerRenderHealthStore(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (detachObserver) return detachObserver;

  const onRenderHealth = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail = parseLayerRenderHealthDetail(event.detail);
    if (!detail) return;
    applyLayerRenderHealth(detail);
  };

  window.addEventListener("altyapi:layerview-health", onRenderHealth);
  detachObserver = () => {
    window.removeEventListener("altyapi:layerview-health", onRenderHealth);
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

export function parseLayerRenderHealthDetail(value: unknown): LayerRenderHealthDetail | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.phase !== "string" || !PHASES.has(record.phase as LayerRenderHealthPhase)) return null;
  if (typeof record.layerId !== "string" || !record.layerId.startsWith("svc-") || record.layerId.length <= 4) return null;
  if (typeof record.serviceId !== "string" || !record.serviceId.trim()) return null;
  if (record.layerId !== `svc-${record.serviceId}`) return null;

  const attempt = positiveInteger(record.attempt);
  const targetScale = positiveFinite(record.targetScale);

  return {
    phase: record.phase as LayerRenderHealthPhase,
    layerId: record.layerId,
    serviceId: record.serviceId,
    ...(attempt !== undefined ? { attempt } : {}),
    ...(targetScale !== undefined ? { targetScale } : {})
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
    ...(detail.targetScale !== undefined ? { targetScale: detail.targetScale } : {})
  };

  switch (detail.phase) {
    case "created":
      return { state: "preparing", updatedAt: now };
    case "stable":
      return { state: "ready", updatedAt: now };
    case "scale-repair":
      return { state: "scale-adjusting", ...base };
    case "recycle-attempt":
      return { state: "recovering", ...base };
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
    previous.targetScale === state.targetScale
  ) return;
  snapshot = { ...snapshot, [serviceId]: state };
  notifySubscribers();
}

function notifySubscribers(): void {
  for (const listener of subscribers) listener();
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function positiveFinite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatScale(value: number): string {
  return Math.round(value).toLocaleString("tr-TR");
}
