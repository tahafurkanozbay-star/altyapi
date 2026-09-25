import type Layer from "@arcgis/core/layers/Layer.js";
import type { ServiceDefinition } from "../types";

export type ServiceVisualCategory =
  | "natural-gas"
  | "stormwater"
  | "wastewater"
  | "drinking-water"
  | "planning"
  | "boundary"
  | "three-d"
  | "generic";

export type NormalizedGeometryType = "point" | "polyline" | "polygon" | "mesh" | "unknown";

export interface LayerVisualProfile {
  category: ServiceVisualCategory;
  color: [number, number, number, number];
  outlineColor: [number, number, number, number];
  fillColor: [number, number, number, number];
  lineWidth: number;
  markerSize: number;
  sceneEdgeSize: number;
  forceRenderer: boolean;
}

type RenderableLayer = Layer & {
  geometryType?: string | null;
  renderer?: unknown;
  blendMode?: string;
  sublayers?: {
    toArray(): Array<{
      geometryType?: string | null;
      renderer?: unknown;
      opacity?: number;
    }>;
  };
  capabilities?: {
    supportsDynamicLayers?: boolean;
  };
};

const VISUALS: Record<ServiceVisualCategory, Omit<LayerVisualProfile, "category">> = {
  "natural-gas": {
    color: [255, 153, 0, 1],
    outlineColor: [255, 218, 92, 1],
    fillColor: [255, 153, 0, 0.22],
    lineWidth: 4.5,
    markerSize: 12,
    sceneEdgeSize: 1.7,
    forceRenderer: true
  },
  stormwater: {
    color: [0, 199, 255, 1],
    outlineColor: [177, 242, 255, 1],
    fillColor: [0, 199, 255, 0.2],
    lineWidth: 4.25,
    markerSize: 11.5,
    sceneEdgeSize: 1.6,
    forceRenderer: true
  },
  wastewater: {
    color: [255, 59, 94, 1],
    outlineColor: [255, 189, 200, 1],
    fillColor: [255, 59, 94, 0.2],
    lineWidth: 4.5,
    markerSize: 11.5,
    sceneEdgeSize: 1.7,
    forceRenderer: true
  },
  "drinking-water": {
    color: [0, 122, 255, 1],
    outlineColor: [181, 218, 255, 1],
    fillColor: [0, 122, 255, 0.2],
    lineWidth: 4.5,
    markerSize: 11.5,
    sceneEdgeSize: 1.7,
    forceRenderer: true
  },
  planning: {
    color: [191, 90, 242, 1],
    outlineColor: [235, 202, 255, 1],
    fillColor: [191, 90, 242, 0.12],
    lineWidth: 3,
    markerSize: 10.5,
    sceneEdgeSize: 1.4,
    forceRenderer: false
  },
  boundary: {
    color: [255, 0, 168, 1],
    outlineColor: [255, 198, 236, 1],
    fillColor: [255, 0, 168, 0],
    lineWidth: 3.75,
    markerSize: 11,
    sceneEdgeSize: 1.5,
    forceRenderer: true
  },
  "three-d": {
    color: [0, 224, 178, 1],
    outlineColor: [184, 255, 238, 1],
    fillColor: [0, 224, 178, 0.34],
    lineWidth: 3,
    markerSize: 10.5,
    sceneEdgeSize: 1.8,
    forceRenderer: true
  },
  generic: {
    color: [255, 214, 10, 1],
    outlineColor: [255, 244, 178, 1],
    fillColor: [255, 214, 10, 0.18],
    lineWidth: 3.5,
    markerSize: 10.5,
    sceneEdgeSize: 1.5,
    forceRenderer: false
  }
};

export function classifyServiceVisual(service: Pick<ServiceDefinition, "displayName">): ServiceVisualCategory {
  const name = normalizeName(service.displayName);
  if (name.includes("dogalgaz")) return "natural-gas";
  if (name.includes("yagmur suyu")) return "stormwater";
  if (name.includes("pis su")) return "wastewater";
  if (name.includes("icme suyu")) return "drinking-water";
  if (name.includes("uygulama imar") || name.includes("uip")) return "planning";
  if (name.includes("sinirlar") || name.includes("sinir")) return "boundary";
  if (/\b3d\b/.test(name) || name.startsWith("3d")) return "three-d";
  return "generic";
}

export function serviceVisualProfile(service: Pick<ServiceDefinition, "displayName">): LayerVisualProfile {
  const category = classifyServiceVisual(service);
  return { category, ...VISUALS[category] };
}

export function normalizeGeometryType(value: string | null | undefined): NormalizedGeometryType {
  const geometry = String(value ?? "").toLocaleLowerCase("en-US");
  if (geometry.includes("polyline") || geometry.includes("line")) return "polyline";
  if (geometry.includes("polygon")) return "polygon";
  if (geometry.includes("multipoint") || geometry.includes("point")) return "point";
  if (geometry.includes("mesh")) return "mesh";
  return "unknown";
}

export function buildVisibilityRenderer(
  profile: LayerVisualProfile,
  geometryType: string | null | undefined,
  sceneLayer = false
): Record<string, unknown> | undefined {
  const geometry = normalizeGeometryType(geometryType);
  if (sceneLayer && geometry === "mesh") {
    return {
      type: "simple",
      symbol: {
        type: "mesh-3d",
        symbolLayers: [{
          type: "fill",
          material: { color: profile.color },
          edges: {
            type: "solid",
            color: profile.outlineColor,
            size: profile.sceneEdgeSize
          }
        }]
      }
    };
  }

  if (geometry === "polyline") {
    return {
      type: "simple",
      symbol: {
        type: "simple-line",
        color: profile.color,
        width: profile.lineWidth,
        style: "solid"
      }
    };
  }

  if (geometry === "polygon") {
    return {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: profile.fillColor,
        style: profile.category === "boundary" ? "none" : "solid",
        outline: {
          color: profile.color,
          width: profile.lineWidth
        }
      }
    };
  }

  if (geometry === "point") {
    return {
      type: "simple",
      symbol: {
        type: "simple-marker",
        color: profile.color,
        size: profile.markerSize,
        style: "circle",
        outline: {
          color: profile.outlineColor,
          width: Math.max(1.5, profile.lineWidth * 0.42)
        }
      }
    };
  }

  return undefined;
}

/**
 * Applies a semantic, high-contrast visual system after remote metadata has
 * loaded. Server cartography is preserved when replacing it would destroy
 * important thematic information (for example the UIP planning service).
 */
export function applyLoadedLayerVisuals(service: ServiceDefinition, layer: Layer): void {
  const target = layer as RenderableLayer;
  const profile = serviceVisualProfile(service);

  // User requested maximum legibility. Keep image services opaque and avoid
  // blend modes that can make utility colors disappear over aerial basemaps.
  layer.opacity = 1;
  target.blendMode = "normal";

  if (service.kind === "WMS") return;

  if (service.kind === "MapServer") {
    if (!profile.forceRenderer || target.capabilities?.supportsDynamicLayers !== true) return;
    for (const sublayer of target.sublayers?.toArray() ?? []) {
      const renderer = buildVisibilityRenderer(profile, sublayer.geometryType, false);
      if (!renderer) continue;
      try {
        sublayer.renderer = renderer;
        sublayer.opacity = 1;
      } catch {
        // Some legacy map services expose sublayers but reject dynamic renderers.
        // Their server-side symbology remains active and fully opaque.
      }
    }
    return;
  }

  if (!profile.forceRenderer) return;
  const renderer = buildVisibilityRenderer(profile, target.geometryType, service.kind === "SceneServer");
  if (!renderer) return;
  try {
    target.renderer = renderer;
  } catch {
    // Preserve provider rendering if the concrete layer subtype rejects a
    // client renderer; successful layer loading is more important than styling.
  }
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
