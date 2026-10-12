import { asRecord } from "../src/platform/runtimeContracts";
import type { ServiceVerificationEntry } from "../src/types";

export type QueryParameters = Record<string, string | number | boolean | undefined | null>;
export type HealthProbeResult = Omit<ServiceVerificationEntry, "index" | "name" | "kind">;
export interface TextProbeResponse {
  ok: boolean;
  status: number;
  ms: number;
  text: string;
  type: string;
  error?: string;
}
export interface HealthProbeResponse extends TextProbeResponse { cors: boolean }
export interface RemoteScaleMetadata {
  minScale?: unknown;
  maxScale?: unknown;
  count?: number;
  error?: { message?: unknown };
  layerDefinition?: { minScale?: unknown; maxScale?: unknown };
  layers?: Array<{ id?: number; minScale?: unknown; maxScale?: unknown }>;
}
export interface ScaleProbeResponse extends TextProbeResponse { data?: RemoteScaleMetadata }
export interface ScaleAuditResult {
  reachable: boolean;
  source: string;
  http?: number;
  latencyMs?: number;
  minScale?: number;
  maxScale?: number;
  explicitScaleLimit?: boolean;
  childRangeCount?: number;
  childRanges?: Array<{ id?: number; minScale?: number; maxScale?: number }>;
  note: string;
}

export function networkErrorCode(error: unknown): string {
  const cause = error instanceof Error ? asRecord(error.cause) : null;
  const code = cause?.code;
  if (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,39}$/.test(code)) return code;
  return error instanceof Error ? error.name : "network-error";
}

export function parseRemoteMetadata(text: string): RemoteScaleMetadata | undefined {
  try {
    const value: unknown = JSON.parse(text);
    const record = asRecord(value);
    if (!record) return undefined;
    const definition = asRecord(record.layerDefinition);
    const error = asRecord(record.error);
    return {
      minScale: record.minScale,
      maxScale: record.maxScale,
      ...(typeof record.count === "number" ? { count: record.count } : {}),
      ...(record.error ? { error: { message: error?.message } } : {}),
      ...(definition ? { layerDefinition: { minScale: definition.minScale, maxScale: definition.maxScale } } : {}),
      ...(Array.isArray(record.layers) ? { layers: record.layers.flatMap((value) => {
        const layer = asRecord(value);
        return layer ? [{
          ...(typeof layer.id === "number" ? { id: layer.id } : {}),
          minScale: layer.minScale, maxScale: layer.maxScale
        }] : [];
      }) } : {})
    };
  } catch {
    return undefined;
  }
}
