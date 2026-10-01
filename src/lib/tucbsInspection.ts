import type { OperationalExtent } from "../types";
import { inspectOgcCapabilitiesOffMainThread } from "../platform/ogcCapabilitiesWorker";
import { readResponseTextLimited, ResponseSizeLimitError } from "../platform/responseText";
import {
  classifyTucbsVerificationFailure,
  type TucbsBrowserEndpointVerification,
  type TucbsBrowserVerificationReport
} from "./tucbsBrowserVerification";
import {
  sanitizeTucbsUrl,
  type TucbsEndpointMap,
  type TucbsScaleProfileMap
} from "./tucbsAccess";
import type { TucbsCoverageProfileMap } from "./tucbsCoverage";

const MAX_CAPABILITIES_BYTES = 4_000_000;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_CONCURRENCY = 3;
const SUCCESS_CACHE_TTL_MS = 60_000;
const FAILURE_CACHE_TTL_MS = 5_000;

export interface TucbsInspectionReport extends TucbsBrowserVerificationReport {
  coverageProfiles: TucbsCoverageProfileMap;
}

export interface TucbsInspectionOptions {
  timeoutMs?: number;
  concurrency?: number;
  bypassCache?: boolean;
  signal?: AbortSignal;
}

interface InspectionRow {
  verification: TucbsBrowserEndpointVerification;
  extent?: OperationalExtent;
}

interface CachedInspection {
  expiresAt: number;
  report: TucbsInspectionReport;
}

const inspectionCache = new Map<string, CachedInspection>();
const inspectionInFlight = new Map<string, Promise<TucbsInspectionReport>>();

/**
 * Verifies each authorized endpoint once and extracts all reusable WMS metadata
 * from that same response. Modern capabilities are preferred and a legacy
 * request is used only for version/format compatibility failures.
 *
 * No protected URL is copied into the report/cache. OGC XML parsing is delegated
 * to a typed Dedicated Worker when supported; only response text crosses that
 * boundary, never the signed endpoint itself.
 */
export async function inspectTucbsBrowserServices(
  endpoints: TucbsEndpointMap,
  options: TucbsInspectionOptions = {}
): Promise<TucbsInspectionReport> {
  throwIfAborted(options.signal);
  const safeEndpoints = sanitizeEndpointMap(endpoints);
  const fingerprint = fingerprintEndpointMap(safeEndpoints);
  const now = Date.now();

  if (!options.bypassCache) {
    const cached = inspectionCache.get(fingerprint);
    if (cached && cached.expiresAt > now) return cached.report;
    if (cached) inspectionCache.delete(fingerprint);
    const running = inspectionInFlight.get(fingerprint);
    if (running) return running;
  }

  const request = runInspection(safeEndpoints, options)
    .then((report) => {
      const ttl = report.failed === 0 ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS;
      inspectionCache.set(fingerprint, { expiresAt: Date.now() + ttl, report });
      return report;
    })
    .finally(() => {
      inspectionInFlight.delete(fingerprint);
    });

  inspectionInFlight.set(fingerprint, request);
  return request;
}

export function clearTucbsInspectionCache(): void {
  inspectionCache.clear();
  inspectionInFlight.clear();
}

async function runInspection(
  endpoints: TucbsEndpointMap,
  options: TucbsInspectionOptions
): Promise<TucbsInspectionReport> {
  const entries = Object.entries(endpoints);
  const timeoutMs = clampInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 3_000, 30_000);
  const concurrency = clampInteger(options.concurrency ?? DEFAULT_CONCURRENCY, 1, 6);
  const rows = await mapWithConcurrency(entries, concurrency, async ([key, endpoint]) => {
    throwIfAborted(options.signal);
    const modernVersion = key.endsWith(".wms") ? "1.3.0" : "2.0.0";
    const first = await probeCapabilities(key, endpoint, modernVersion, timeoutMs, options.signal);
    if (first.verification.ok || !shouldTryLegacy(first.verification)) return first;

    const legacyVersion = key.endsWith(".wms") ? "1.1.1" : "1.1.0";
    const fallback = await probeCapabilities(key, endpoint, legacyVersion, timeoutMs, options.signal);
    return fallback.verification.ok
      ? {
          ...fallback,
          verification: {
            ...fallback.verification,
            compatibilityFallback: true
          }
        }
      : first;
  });

  const results = rows.map((row) => row.verification);
  const failureCounts: TucbsBrowserVerificationReport["failureCounts"] = {};
  for (const result of results) {
    if (result.ok || !result.failureCode) continue;
    failureCounts[result.failureCode] = (failureCounts[result.failureCode] ?? 0) + 1;
  }

  return {
    total: results.length,
    verified: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
    failureCounts,
    scaleProfiles: buildScaleProfiles(results),
    coverageProfiles: buildCoverageProfiles(rows, endpoints)
  };
}

async function probeCapabilities(
  key: string,
  endpoint: string,
  version: string,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<InspectionRow> {
  const isWms = key.endsWith(".wms");
  const startedAt = performance.now();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "AbortError")), timeoutMs);

  try {
    throwIfAborted(parentSignal);
    const target = new URL(endpoint);
    target.searchParams.set("SERVICE", isWms ? "WMS" : "WFS");
    target.searchParams.set("REQUEST", "GetCapabilities");
    target.searchParams.set("VERSION", version);
    const response = await fetch(target.toString(), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/xml,text/xml,*/*" }
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) return failureRow(key, latencyMs, `HTTP ${response.status}`);

    const text = await readResponseTextLimited(response, MAX_CAPABILITIES_BYTES);
    const inspection = await inspectOgcCapabilitiesOffMainThread(text, isWms ? "WMS" : "WFS");
    if (inspection.exception) return failureRow(key, latencyMs, "OGC servis hata yanıtı döndürdü");
    if (!inspection.valid) return failureRow(key, latencyMs, "Capabilities yanıtı beklenen OGC biçiminde değil");

    return {
      verification: {
        key,
        ok: true,
        latencyMs,
        minScale: inspection.scaleProfile?.minScale,
        maxScale: inspection.scaleProfile?.maxScale,
        recommendedScale: inspection.scaleProfile?.recommendedScale,
        capabilityVersion: inspection.capabilityVersion ?? version
      },
      extent: inspection.geographicExtent
    };
  } catch (error) {
    if (parentSignal?.aborted) throw abortError(parentSignal.reason);
    const latencyMs = Math.round(performance.now() - startedAt);
    if (error instanceof ResponseSizeLimitError) {
      return failureRow(key, latencyMs, "Capabilities yanıtı beklenenden büyük");
    }
    const reason = controller.signal.aborted
      ? "Zaman aşımı"
      : "Tarayıcıdan ağ erişimi kurulamadı";
    return failureRow(key, latencyMs, reason);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function failureRow(key: string, latencyMs: number, reason: string): InspectionRow {
  return {
    verification: {
      key,
      ok: false,
      latencyMs,
      reason,
      ...classifyTucbsVerificationFailure(reason)
    }
  };
}

function shouldTryLegacy(result: TucbsBrowserEndpointVerification): boolean {
  if (!result.reason) return false;
  return /OGC servis hata|Capabilities yanıtı/i.test(result.reason) || /^HTTP\s+(?:400|406|415)$/i.test(result.reason);
}

function buildScaleProfiles(results: TucbsBrowserEndpointVerification[]): TucbsScaleProfileMap {
  const verifiedAt = new Date().toISOString();
  const output: TucbsScaleProfileMap = {};
  for (const result of results) {
    if (!result.ok || !result.key.endsWith(".wms") || (!result.minScale && !result.maxScale)) continue;
    output[result.key] = {
      minScale: result.minScale,
      maxScale: result.maxScale,
      recommendedScale: result.recommendedScale,
      verifiedAt,
      source: "wms-capabilities"
    };
  }
  for (const result of results) {
    if (!result.ok || !result.key.endsWith(".wfs")) continue;
    const peer = output[result.key.replace(/\.wfs$/, ".wms")];
    if (peer) output[result.key] = { ...peer, source: "paired-wms-capabilities" };
  }
  return output;
}

function buildCoverageProfiles(rows: InspectionRow[], endpoints: TucbsEndpointMap): TucbsCoverageProfileMap {
  const verifiedAt = new Date().toISOString();
  const output: TucbsCoverageProfileMap = {};
  const verifiedKeys = new Set(rows.filter((row) => row.verification.ok).map((row) => row.verification.key));

  for (const row of rows) {
    if (!row.verification.ok || !row.verification.key.endsWith(".wms") || !row.extent) continue;
    const key = row.verification.key;
    output[key] = { extent: row.extent, verifiedAt, source: "wms-capabilities" };
    const peerKey = key.replace(/\.wms$/, ".wfs");
    if (endpoints[peerKey] && verifiedKeys.has(peerKey)) {
      output[peerKey] = { extent: row.extent, verifiedAt, source: "paired-wms-capabilities" };
    }
  }
  return output;
}

function sanitizeEndpointMap(endpoints: TucbsEndpointMap): TucbsEndpointMap {
  const output: TucbsEndpointMap = {};
  for (const [key, url] of Object.entries(endpoints)) {
    if (!/^tucbs\.[a-z0-9-]+\.(?:wms|wfs)$/.test(key)) continue;
    output[key] = sanitizeTucbsUrl(url);
  }
  return output;
}

function fingerprintEndpointMap(endpoints: TucbsEndpointMap): string {
  const entries = Object.entries(endpoints).sort(([left], [right]) => left.localeCompare(right));
  let hash = 0x811c9dc5;
  for (const [key, url] of entries) {
    const value = `${key}\u0000${url}\u0000`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(36);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => worker()));
  return results;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw abortError(signal.reason);
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new DOMException("Aborted", "AbortError");
}
