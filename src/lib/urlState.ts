import type { CameraState } from "../types";

export interface ShareState {
  camera: CameraState;
  layerIds: string[];
  basemap?: string;
}

export function encodeShareState(state: ShareState): URLSearchParams {
  const { camera } = state;
  return new URLSearchParams({
    lon: camera.longitude.toFixed(6),
    lat: camera.latitude.toFixed(6),
    z: String(Math.round(camera.z)),
    heading: String(Math.round(camera.heading * 10) / 10),
    tilt: String(Math.round(camera.tilt * 10) / 10),
    layers: state.layerIds.join(","),
    ...(state.basemap ? { basemap: state.basemap } : {})
  });
}

export function decodeShareState(params: URLSearchParams): ShareState | undefined {
  const required = ["lon", "lat", "z", "heading", "tilt"] as const;
  if (required.some((key) => !params.has(key))) return undefined;
  const values = required.map((key) => Number(params.get(key)));
  if (values.some((value) => !Number.isFinite(value))) return undefined;
  const [longitude, latitude, z, heading, tilt] = values as [number, number, number, number, number];
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || z < -1000 || z > 10_000_000) return undefined;
  return {
    camera: { longitude, latitude, z, heading, tilt },
    layerIds: (params.get("layers") ?? "").split(",").filter(Boolean),
    basemap: params.get("basemap") ?? undefined
  };
}
