import { publishRuntimeEvent } from "../platform/runtimeEvents";

const pendingActivations = new Map<string, number>();

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
    publishRuntimeEvent("atomic-layer-activation-complete", { layerId });
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
