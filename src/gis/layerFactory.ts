import type Layer from "@arcgis/core/layers/Layer.js";
import type { ServiceDefinition } from "../types";
import { isUnconfiguredTucbsUrl } from "../lib/tucbsAccess";
import { applyLoadedLayerVisuals } from "./layerVisuals";

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
  if (service.kind === "WMS") selectBestWmsSublayer(service, layer);
  applyLoadedLayerVisuals(service, layer);
}

export async function createLayer(service: ServiceDefinition): Promise<Layer> {
  if (isUnconfiguredTucbsUrl(service.url)) {
    window.dispatchEvent(new CustomEvent("altyapi:tucbs-access-required", {
      detail: { serviceId: service.id, serviceName: service.displayName, kind: service.kind }
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

  switch (service.kind) {
    case "FeatureServer": {
      const { default: FeatureLayer } = await import("@arcgis/core/layers/FeatureLayer.js");
      return new FeatureLayer({
        ...common,
        url: service.url,
        outFields: ["*"],
        popupEnabled: true
      });
    }
    case "SceneServer": {
      const { default: SceneLayer } = await import("@arcgis/core/layers/SceneLayer.js");
      return new SceneLayer({ ...common, url: service.url, popupEnabled: true });
    }
    case "MapServer": {
      const { default: MapImageLayer } = await import("@arcgis/core/layers/MapImageLayer.js");
      const { root, sublayerId } = parseMapServerUrl(service.url);
      return new MapImageLayer({
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
    }
    case "WMS": {
      const { default: WMSLayer } = await import("@arcgis/core/layers/WMSLayer.js");
      return new WMSLayer({ ...common, url: service.url, imageFormat: "image/png" });
    }
    case "WFS": {
      const { default: WFSLayer } = await import("@arcgis/core/layers/WFSLayer.js");
      return new WFSLayer({ ...common, url: service.url });
    }
  }
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
