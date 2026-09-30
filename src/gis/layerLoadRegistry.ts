export interface CancellableLayerLoad {
  cancelLoad(): void;
}

type TrackedLayerLoad = {
  ref: WeakRef<CancellableLayerLoad>;
};

const trackedLoads = new Map<string, TrackedLayerLoad>();

/**
 * Keeps only a weak reference to the newest ArcGIS Layer created for a logical
 * service. The registry exists solely so an explicit hide/dispose action can
 * cancel metadata/network work that is no longer useful to the user.
 */
export function trackLayerLoad(serviceId: string, layer: CancellableLayerLoad): void {
  trackedLoads.set(serviceId, { ref: new WeakRef(layer) });
}

/** Removes the registration only when it still belongs to this exact layer. */
export function releaseTrackedLayerLoad(serviceId: string, layer: CancellableLayerLoad): void {
  const tracked = trackedLoads.get(serviceId);
  if (!tracked) return;
  const current = tracked.ref.deref();
  if (!current || current === layer) trackedLoads.delete(serviceId);
}

/**
 * Best-effort cancellation. ArcGIS owns the underlying transport semantics;
 * callers only request cancellation and continue to rely on desiredVisibility
 * to reject any late result that still resolves.
 */
export function cancelTrackedLayerLoad(serviceId: string): boolean {
  const tracked = trackedLoads.get(serviceId);
  if (!tracked) return false;
  trackedLoads.delete(serviceId);
  const layer = tracked.ref.deref();
  if (!layer) return false;
  try {
    layer.cancelLoad();
    return true;
  } catch {
    return false;
  }
}

export function cancelAllTrackedLayerLoads(): number {
  let cancelled = 0;
  for (const serviceId of [...trackedLoads.keys()]) {
    if (cancelTrackedLayerLoad(serviceId)) cancelled += 1;
  }
  return cancelled;
}

export function trackedLayerLoadCount(): number {
  for (const [serviceId, tracked] of trackedLoads) {
    if (!tracked.ref.deref()) trackedLoads.delete(serviceId);
  }
  return trackedLoads.size;
}
