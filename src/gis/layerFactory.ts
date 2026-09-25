import type Layer from "@arcgis/core/layers/Layer.js";
import type { ServiceDefinition } from "../types";
import { isUnconfiguredTucbsUrl } from "../lib/tucbsAccess";
import { serviceAttemptCandidates } from "../lib/serviceFailover";
import { applyLoadedLayerVisuals } from "./layerVisuals";

const creationCursor = new Map<string, number>();
const effectiveServiceByLayer = new WeakMap<Layer, ServiceDefinition>();

export function parseMapServerUrl(url: string): { root: string; sublayerId?: number } {
  const match = url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  if (!match) return { root: url };
  return {
    root: match[1]!,
    sublayerId: match[2] === undefined ? undefined : Number(match[2])
  };
}

type WmsSublayerLike = {
  name?: string | null;
  title?: string | null;
  sublayers?: { length: number } | null;
};

type WmsLayerLike = Layer & {
  allSublayers?: { toArray(): WmsSublayerLike[] };
  sublayers?: WmsSublayerLike[];
};

export function ogcLayerMatchScore(
  expectedName: string,
  candidate: Pick<WmsSublayerLike, "name" | "title">
): number {
  const expected = normalizeLayerName(expectedName);
  if (!expected) return 0;

  const candidates = [candidate.title, candidate.name]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(normalizeLayerName);

  let best = 0;
  for (const value of candidates) {
    if (!value) continue;
    if (value === expected) best = Math.max(best, 100);
    else if (value.includes(expected) || expected.includes(value)) best = Math.max(best, 78);
    else {
      const expectedTokens = new Set(expected.split(" ").filter(Boolean));
      const valueTokens = new Set(value.split(" ").filter(Boolean));
      const overlap = [...expectedTokens].filter((token) => valueTokens.has(token)).length;
      const union = new Set([...expectedTokens, ...valueTokens]).size;
      if (union > 0) best = Math.max(best, Math.round((overlap / union) * 70));
    }
  }
  return best;
}

/**
 * Runs after ArcGIS has loaded remote metadata. It first narrows multi-layer
 * WMS services to the high-confidence catalogue match, then applies the v17
 * semantic high-visibility renderer using the actual geometry metadata.
 */
export function finalizeLoadedLayer(service: ServiceDefinition, layer: Layer): void {
  const effectiveService = effectiveServiceByLayer.get(layer) ?? service;
  if (effectiveService.kind === "WMS") selectBestWmsSublayer(effectiveService, layer);
  applyLoadedLayerVisuals(effectiveService, layer);
  creationCursor.delete(service.id);
  effectiveServiceByLayer.delete(layer);
}

/**
 * The runtime deliberately creates a fresh ArcGIS Layer instance for each
 * retry. v17 uses that property to rotate between equivalent WMS/WFS transports
 * for the same logical TUCBS dataset without changing UI identity.
 */
export async function createLayer(service: ServiceDefinition): Promise<Layer> {
  const effectiveService = nextCreationService(service);
  if (isUnconfiguredTucbsUrl(effectiveService.url)) {
    window.dispatchEvent(new CustomEvent("altyapi:tucbs-access-required", {
      detail: { serviceId: service.id, serviceName: service.displayName, kind: effectiveService.kind }
    }));
    throw new Error("TUCBS yetkili servis adresi bu tarayıcıda tanımlı değil.");
  }

  const common = {
    id: `svc-${service.id}`,
    title: service.displayName,
    visible: service.visible,
    opacity: 1,
    minScale: service.operationalMinScale,
    maxScale: service.operationalMaxScale,
    listMode: "show" as const
  };

  let layer: Layer;
  switch (effectiveService.kind) {
    case "FeatureServer": {
      const { default: FeatureLayer } = await import("@arcgis/core/layers/FeatureLayer.js");
      layer = new FeatureLayer({
        ...common,
        url: effectiveService.url,
        outFields: ["*"],
        popupEnabled: true
      });
      break;
    }
    case "SceneServer": {
      const { default: SceneLayer } = await import("@arcgis/core/layers/SceneLayer.js");
      layer = new SceneLayer({ ...common, url: effectiveService.url, popupEnabled: true });
      break;
    }
    case "MapServer": {
      const { default: MapImageLayer } = await import("@arcgis/core/layers/MapImageLayer.js");
      const { root, sublayerId } = parseMapServerUrl(effectiveService.url);
      layer = new MapImageLayer({
        ...common,
        url: root,
        sublayers: sublayerId === undefined ? undefined : [{
          id: sublayerId,
          visible: true,
          opacity: 1,
          minScale: service.operationalMinScale,
          maxScale: service.operationalMaxScale
        }]
      });
      break;
    }
    case "WMS": {
      const { default: WMSLayer } = await import("@arcgis/core/layers/WMSLayer.js");
      layer = new WMSLayer({ ...common, url: effectiveService.url, imageFormat: "image/png" });
      break;
    }
    case "WFS": {
      const { default: WFSLayer } = await import("@arcgis/core/layers/WFSLayer.js");
      layer = new WFSLayer({ ...common, url: effectiveService.url });
      break;
    }
  }

  effectiveServiceByLayer.set(layer, effectiveService);
  return layer;
}

export function resetServiceCreationCursor(serviceId: string): void {
  creationCursor.delete(serviceId);
}

function nextCreationService(service: ServiceDefinition): ServiceDefinition {
  const candidates = serviceAttemptCandidates(service);
  if (candidates.length <= 1) return service;
  const cursor = creationCursor.get(service.id) ?? 0;
  creationCursor.set(service.id, cursor + 1);
  return candidates[cursor % candidates.length] ?? service;
}

function selectBestWmsSublayer(service: ServiceDefinition, layer: Layer): void {
  const wms = layer as WmsLayerLike;
  const candidates = (wms.allSublayers?.toArray() ?? [])
    .filter((sublayer) => (sublayer.sublayers?.length ?? 0) === 0)
    .map((sublayer) => ({ sublayer, score: ogcLayerMatchScore(service.displayName, sublayer) }))
    .sort((left, right) => right.score - left.score);

  if (candidates.length <= 1) return;
  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.score < 70) return;
  if (second && best.score < 100 && best.score - second.score < 12) return;
  wms.sublayers = [best.sublayer];
}

function normalizeLayerName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
