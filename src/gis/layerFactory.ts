import type Layer from "@arcgis/core/layers/Layer.js";
import type { ServiceDefinition } from "../types";

export function parseMapServerUrl(url: string): { root: string; sublayerId?: number } {
  const match = url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  if (!match) return { root: url };
  return {
    root: match[1]!,
    sublayerId: match[2] === undefined ? undefined : Number(match[2])
  };
}

export async function createLayer(service: ServiceDefinition): Promise<Layer> {
  const common = {
    id: `svc-${service.id}`,
    title: service.displayName,
    visible: service.visible,
    opacity: service.opacity,
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
