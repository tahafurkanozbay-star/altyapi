import type { CameraState } from "../types";

export interface ShareState {
  camera: CameraState;
  layerIds: string[];
  basemap?: string;
}

const MAX_LAYER_IDS = 100;
const MAX_LAYER_ID_LENGTH = 160;
const BASEMAP_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

export function encodeShareState(state: ShareState): URLSearchParams {
  const { camera } = state;
  const layerIds = sanitizeLayerIds(state.layerIds);
  const basemap = state.basemap && BASEMAP_PATTERN.test(state.basemap) ? state.basemap : undefined;
  return new URLSearchParams({
    lon: camera.longitude.toFixed(6),
    lat: camera.latitude.toFixed(6),
    z: String(Math.round(camera.z)),
    heading: String(Math.round(camera.heading * 10) / 10),
    tilt: String(Math.round(camera.tilt * 10) / 10),
    layers: layerIds.join(","),
    ...(basemap ? { basemap } : {})
  });
}

export function decodeShareState(params: URLSearchParams): ShareState | undefined {
  const required = ["lon", "lat", "z", "heading", "tilt"] as const;
  if (required.some((key) => !params.has(key))) return undefined;
  const values = required.map((key) => Number(params.get(key)));
  if (values.some((value) => !Number.isFinite(value))) return undefined;
  const [longitude, latitude, z, heading, tilt] = values as [number, number, number, number, number];

  if (
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180 ||
    z < -1000 || z > 10_000_000 ||
    heading < -360 || heading > 360 ||
    tilt < 0 || tilt > 180
  ) return undefined;

  const rawBasemap = params.get("basemap") ?? undefined;
  const basemap = rawBasemap && BASEMAP_PATTERN.test(rawBasemap) ? rawBasemap : undefined;

  return {
    camera: { longitude, latitude, z, heading, tilt },
    layerIds: sanitizeLayerIds((params.get("layers") ?? "").split(",")),
    basemap
  };
}

function sanitizeLayerIds(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const id = value.trim();
    if (!id || id.length > MAX_LAYER_ID_LENGTH || !/^[a-z0-9_-]+$/i.test(id)) continue;
    unique.add(id);
    if (unique.size >= MAX_LAYER_IDS) break;
  }
  return [...unique];
}
