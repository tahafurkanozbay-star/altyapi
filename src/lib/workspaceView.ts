import type { LayerOrderDirection } from "../types";

/** Returns every available service exactly once in deterministic top-to-bottom order. */
export function normalizeLayerOrder(preferred: readonly string[], available: readonly string[]): string[] {
  const allowed = new Set(available);
  const seen = new Set<string>();
  const output: string[] = [];

  for (const id of preferred) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }
  for (const id of available) {
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }
  return output;
}

/** Moves a layer relative to the next visible neighbor while preserving hidden-layer slots. */
export function moveVisibleLayer(
  order: readonly string[],
  visibleIds: readonly string[],
  serviceId: string,
  direction: LayerOrderDirection
): string[] {
  const visibleSet = new Set(visibleIds);
  const visibleOrder = order.filter((id) => visibleSet.has(id));
  const visibleIndex = visibleOrder.indexOf(serviceId);
  if (visibleIndex < 0) return [...order];

  const neighborIndex = direction === "up" ? visibleIndex - 1 : visibleIndex + 1;
  const neighborId = visibleOrder[neighborIndex];
  if (!neighborId) return [...order];

  const output = [...order];
  const sourceIndex = output.indexOf(serviceId);
  const targetIndex = output.indexOf(neighborId);
  if (sourceIndex < 0 || targetIndex < 0) return output;
  [output[sourceIndex], output[targetIndex]] = [output[targetIndex]!, output[sourceIndex]!];
  return output;
}

/**
 * Restores a bookmark's captured visible stack at the top while retaining every
 * currently known service outside that snapshot in its existing relative order.
 */
export function mergeCapturedLayerOrder(
  currentOrder: readonly string[],
  capturedOrder: readonly string[],
  available: readonly string[]
): string[] {
  const normalized = normalizeLayerOrder(currentOrder, available);
  const allowed = new Set(available);
  const captured: string[] = [];
  const seen = new Set<string>();

  for (const id of capturedOrder) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    captured.push(id);
  }

  return [...captured, ...normalized.filter((id) => !seen.has(id))];
}

export function visibleLayerOrder(order: readonly string[], visibleIds: readonly string[]): string[] {
  const visible = new Set(visibleIds);
  return order.filter((id) => visible.has(id));
}
