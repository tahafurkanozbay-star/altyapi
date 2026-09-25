import type { ServiceDefinition } from "../types";
import { recommendedActivationScale } from "./serviceNavigation";

const MAX_SCALE = 1_000_000_000;

export interface RuntimeScaleRange {
  minScale?: number;
  maxScale?: number;
  source: "layer-metadata" | "map-sublayer-metadata";
}

type ScaleLike = {
  minScale?: unknown;
  maxScale?: unknown;
};

type SublayerCollectionLike = {
  toArray?: () => ScaleLike[];
  length?: number;
  getItemAt?: (index: number) => ScaleLike | undefined;
};

type LayerScaleLike = ScaleLike & {
  sublayers?: SublayerCollectionLike | ScaleLike[] | null;
};

/**
 * Reads scale declarations from an already-loaded ArcGIS layer without relying
 * on its concrete class. Direct layer metadata wins. If a MapImageLayer has a
 * single configured/loaded sublayer, that sublayer's range is used as a safe
 * fallback. Multi-sublayer roots are intentionally not collapsed into an
 * invented range because different thematic children can legitimately have
 * different visibility envelopes.
 */
export function runtimeScaleRangeFromLoadedLayer(layer: unknown): RuntimeScaleRange | undefined {
  if (!layer || typeof layer !== "object") return undefined;
  const candidate = layer as LayerScaleLike;
  const direct = normalizeRange(candidate.minScale, candidate.maxScale);
  if (direct) return { ...direct, source: "layer-metadata" };

  const sublayers = collectionItems(candidate.sublayers);
  if (sublayers.length !== 1) return undefined;
  const child = normalizeRange(sublayers[0]?.minScale, sublayers[0]?.maxScale);
  return child ? { ...child, source: "map-sublayer-metadata" } : undefined;
}

/**
 * Provider metadata may tighten an existing verified/render-derived profile,
 * but it must never broaden one. The result is therefore the strict
 * intersection of the catalogue profile and the live loaded-layer range.
 */
export function reconcileServiceRuntimeScale(
  service: ServiceDefinition,
  runtimeRange: RuntimeScaleRange | undefined
): ServiceDefinition {
  if (!runtimeRange) return service;

  const minScale = strictMinScale(service.operationalMinScale, runtimeRange.minScale);
  const maxScale = strictMaxScale(service.operationalMaxScale, runtimeRange.maxScale);

  // Defensive fallback: contradictory remote metadata must not poison an
  // already-valid service profile or create an impossible zoom interval.
  if (minScale && maxScale && maxScale >= minScale) return service;

  const changed = minScale !== service.operationalMinScale || maxScale !== service.operationalMaxScale;
  if (!changed) return service;

  const next: ServiceDefinition = {
    ...service,
    operationalMinScale: minScale,
    operationalMaxScale: maxScale,
    renderScaleSensitive: Boolean(minScale || maxScale),
    navigationVerifiedAt: new Date().toISOString()
  };

  const recommendedScale = recommendedActivationScale(next);
  return {
    ...next,
    recommendedScale
  };
}

function collectionItems(value: LayerScaleLike["sublayers"]): ScaleLike[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.toArray === "function") return value.toArray();
  if (typeof value.length === "number" && typeof value.getItemAt === "function") {
    const items: ScaleLike[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item = value.getItemAt(index);
      if (item) items.push(item);
    }
    return items;
  }
  return [];
}

function normalizeRange(minValue: unknown, maxValue: unknown): Omit<RuntimeScaleRange, "source"> | undefined {
  const minScale = positiveScale(minValue);
  const maxScale = positiveScale(maxValue);
  if (!minScale && !maxScale) return undefined;
  if (minScale && maxScale && maxScale >= minScale) return undefined;
  return { minScale, maxScale };
}

function positiveScale(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_SCALE) return undefined;
  return Math.round(numeric);
}

function strictMinScale(current?: number, runtime?: number): number | undefined {
  if (current && runtime) return Math.min(current, runtime);
  return current ?? runtime;
}

function strictMaxScale(current?: number, runtime?: number): number | undefined {
  if (current && runtime) return Math.max(current, runtime);
  return current ?? runtime;
}
