import type { ServiceKind } from "../types";

export type LayerRenderHealthPhase =
  | "created"
  | "stable"
  | "scale-repair"
  | "render-stalled"
  | "recycle-attempt"
  | "render-failed"
  | "recovery-exhausted"
  | "destroyed";

export interface LayerRenderHealthEventDetail {
  phase: LayerRenderHealthPhase;
  layerId: string;
  serviceId: string;
  attempt?: number;
  targetScale?: number;
  elapsedMs?: number;
}

export interface RuntimeEventMap {
  "atomic-layer-activation-complete": {
    layerId: string;
  };
  "layer-render-health": LayerRenderHealthEventDetail;
  "tucbs-access-required": {
    serviceId: string;
    serviceName: string;
    kind: ServiceKind;
  };
}

export type RuntimeEventName = keyof RuntimeEventMap;
export type RuntimeEventListener<K extends RuntimeEventName> = (detail: Readonly<RuntimeEventMap[K]>) => void;

type ErasedRuntimeEventListener = (detail: RuntimeEventMap[RuntimeEventName]) => void;

const listeners = new Map<RuntimeEventName, Set<ErasedRuntimeEventListener>>();

/**
 * In-process event channel for application-owned runtime signals.
 *
 * ArcGIS DOM events intentionally stay on the ArcGIS scene element, but
 * application-internal messages no longer leak onto window as stringly typed
 * CustomEvents. This makes event names/payloads compile-time checked, prevents
 * unrelated page scripts from spoofing internal state, and works in tests/SSR
 * without a browser global.
 */
export function publishRuntimeEvent<K extends RuntimeEventName>(
  name: K,
  detail: Readonly<RuntimeEventMap[K]>
): void {
  const bucket = listeners.get(name);
  if (!bucket?.size) return;
  for (const listener of [...bucket]) listener(detail);
}

export function subscribeRuntimeEvent<K extends RuntimeEventName>(
  name: K,
  listener: RuntimeEventListener<K>
): () => void {
  const bucket = listeners.get(name) ?? new Set<ErasedRuntimeEventListener>();
  const erased: ErasedRuntimeEventListener = (detail) => listener(detail as RuntimeEventMap[K]);
  bucket.add(erased);
  listeners.set(name, bucket);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const current = listeners.get(name);
    current?.delete(erased);
    if (current?.size === 0) listeners.delete(name);
  };
}

export function runtimeEventSubscriberCount(name?: RuntimeEventName): number {
  if (name) return listeners.get(name)?.size ?? 0;
  let total = 0;
  for (const bucket of listeners.values()) total += bucket.size;
  return total;
}
