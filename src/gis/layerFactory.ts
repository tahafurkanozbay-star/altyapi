import type Layer from "@arcgis/core/layers/Layer.js";
import type { ServiceDefinition } from "../types";
import { isUnconfiguredTucbsUrl } from "../lib/tucbsAccess";

export function parseMapServerUrl(url: string): { root: string; sublayerId?: number } {
  const match = url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  if (!match) return { root: url };
  return {
    root: match[1]!,
    sublayerId: match[2] === undefined ? undefined : Number(match[2])
  };
}

export interface FeatureLayerVisualStyle {
  fillStyle: "none";
  fillColor: [number, number, number, number];
  outlineColor: [number, number, number, number];
  outlineWidth: number;
}

export function featureLayerVisualStyle(service: Pick<ServiceDefinition, "displayName" | "kind">): FeatureLayerVisualStyle | undefined {
  if (service.kind !== "FeatureServer") return undefined;
  const normalizedName = service.displayName.trim().toLocaleUpperCase("tr-TR");
  if (normalizedName !== "SINIRLAR") return undefined;

  return {
    fillStyle: "none",
    fillColor: [255, 0, 168, 0],
    outlineColor: [255, 0, 168, 1],
    outlineWidth: 2.75
  };
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
    opacity: service.opacity,
    minScale: service.operationalMinScale,
    maxScale: service.operationalMaxScale,
    listMode: "show" as const
  };

  switch (service.kind) {
    case "FeatureServer": {
      const { default: FeatureLayer } = await import("@arcgis/core/layers/FeatureLayer.js");
      const visualStyle = featureLayerVisualStyle(service);
      let renderer;

      if (visualStyle) {
        const [{ default: SimpleRenderer }, { default: SimpleFillSymbol }] = await Promise.all([
          import("@arcgis/core/renderers/SimpleRenderer.js"),
          import("@arcgis/core/symbols/SimpleFillSymbol.js")
        ]);
        renderer = new SimpleRenderer({
          symbol: new SimpleFillSymbol({
            style: visualStyle.fillStyle,
            color: visualStyle.fillColor,
            outline: {
              color: visualStyle.outlineColor,
              width: visualStyle.outlineWidth
            }
          })
        });
      }

      return new FeatureLayer({
        ...common,
        url: service.url,
        outFields: ["*"],
        popupEnabled: true,
        ...(renderer ? { renderer } : {})
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
