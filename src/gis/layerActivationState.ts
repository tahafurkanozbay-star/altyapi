const pendingActivations = new Map<string, number>();

export const ATOMIC_LAYER_ACTIVATION_EVENT = "altyapi:atomic-layer-activation-complete";

/**
 * Marks a managed ArcGIS layer as being inside the runtime-owned activation
 * transaction. Global LayerView recovery logic uses this signal to avoid
 * issuing a second scale repair while the runtime is still deciding the one
 * activation camera move.
 */
export function beginAtomicLayerActivation(layerId: string): void {
  if (!layerId) return;
  pendingActivations.set(layerId, (pendingActivations.get(layerId) ?? 0) + 1);
}

export function endAtomicLayerActivation(layerId: string): void {
  if (!layerId) return;
  const count = pendingActivations.get(layerId) ?? 0;
  if (count <= 1) {
    pendingActivations.delete(layerId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ATOMIC_LAYER_ACTIVATION_EVENT, { detail: { layerId } }));
    }
    return;
  }
  pendingActivations.set(layerId, count - 1);
}

export function isAtomicLayerActivationPending(layerId: string | undefined): boolean {
  return Boolean(layerId && (pendingActivations.get(layerId) ?? 0) > 0);
}

export function clearAtomicLayerActivationState(): void {
  pendingActivations.clear();
}
