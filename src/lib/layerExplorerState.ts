import type { ServiceAvailability, ServiceKind } from "../types";

const STORAGE_KEY = "ankara-kent-rehberi:layer-explorer:v1";
const KINDS = new Set<ServiceKind | "all">(["all", "SceneServer", "FeatureServer", "MapServer", "WMS", "WFS"]);
const AVAILABILITY = new Set<ServiceAvailability | "all">(["all", "verified", "degraded", "unavailable", "unknown"]);

export interface LayerExplorerState {
  query: string;
  kind: ServiceKind | "all";
  activeOnly: boolean;
  favoriteOnly: boolean;
  availability: ServiceAvailability | "all";
  collapsedGroups: string[];
}

export const DEFAULT_LAYER_EXPLORER_STATE: LayerExplorerState = {
  query: "",
  kind: "all",
  activeOnly: false,
  favoriteOnly: false,
  availability: "all",
  collapsedGroups: []
};

export function parseLayerExplorerState(value: unknown): LayerExplorerState {
  if (!value || typeof value !== "object") return { ...DEFAULT_LAYER_EXPLORER_STATE };
  const candidate = value as Record<string, unknown>;
  const queryValue = candidate["query"];
  const kindValue = candidate["kind"];
  const availabilityValue = candidate["availability"];
  const collapsedGroupsValue = candidate["collapsedGroups"];
  const query = typeof queryValue === "string" ? queryValue.slice(0, 160) : "";
  const kind = typeof kindValue === "string" && KINDS.has(kindValue as ServiceKind | "all")
    ? kindValue as ServiceKind | "all"
    : "all";
  const availability = typeof availabilityValue === "string"
    && AVAILABILITY.has(availabilityValue as ServiceAvailability | "all")
    ? availabilityValue as ServiceAvailability | "all"
    : "all";
  const collapsedGroups = Array.isArray(collapsedGroupsValue)
    ? [...new Set(collapsedGroupsValue.filter((item): item is string => typeof item === "string" && item.length <= 120))].slice(0, 80)
    : [];

  return {
    query,
    kind,
    activeOnly: candidate["activeOnly"] === true,
    favoriteOnly: candidate["favoriteOnly"] === true,
    availability,
    collapsedGroups
  };
}

export function loadLayerExplorerState(): LayerExplorerState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LAYER_EXPLORER_STATE };
    return parseLayerExplorerState(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_LAYER_EXPLORER_STATE };
  }
}

export function saveLayerExplorerState(state: LayerExplorerState): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parseLayerExplorerState(state)));
  } catch {
    // Session storage is an enhancement only; the explorer remains fully usable without it.
  }
}
