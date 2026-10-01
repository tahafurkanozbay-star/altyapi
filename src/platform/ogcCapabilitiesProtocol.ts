import type { OgcCapabilitiesInspection, OgcCapabilityKind } from "../lib/ogcCapabilities";

export interface OgcCapabilitiesWorkerRequest {
  id: number;
  kind: OgcCapabilityKind;
  xml: string;
}

export type OgcCapabilitiesWorkerResponse =
  | { id: number; ok: true; result: OgcCapabilitiesInspection }
  | { id: number; ok: false; error: "parse-failed" };

export function isOgcCapabilitiesWorkerResponse(value: unknown): value is OgcCapabilitiesWorkerResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OgcCapabilitiesWorkerResponse>;
  return typeof candidate.id === "number" && typeof candidate.ok === "boolean";
}
