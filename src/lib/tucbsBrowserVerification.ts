import {
  sanitizeTucbsUrl,
  verifyTucbsEndpoints,
  type TucbsEndpointMap,
  type TucbsEndpointVerification,
  type TucbsScaleProfileMap,
  type TucbsVerificationReport
} from "./tucbsAccess";

export type TucbsVerificationFailureCode =
  | "access-denied"
  | "timeout"
  | "browser-network"
  | "endpoint-not-found"
  | "throttled"
  | "upstream-error"
  | "ogc-exception"
  | "invalid-capabilities"
  | "http-error"
  | "unknown";

export interface TucbsBrowserEndpointVerification extends TucbsEndpointVerification {
  failureCode?: TucbsVerificationFailureCode;
  guidance?: string;
  retryable?: boolean;
}

export interface TucbsBrowserVerificationReport extends Omit<TucbsVerificationReport, "results"> {
  results: TucbsBrowserEndpointVerification[];
  failureCounts: Partial<Record<TucbsVerificationFailureCode, number>>;
}

export interface TucbsBrowserVerificationOptions {
  timeoutMs?: number;
  concurrency?: number;
  successCacheTtlMs?: number;
  failureCacheTtlMs?: number;
  bypassCache?: boolean;
}

interface CachedVerification {
  expiresAt: number;
  report: TucbsBrowserVerificationReport;
}

const DEFAULT_SUCCESS_CACHE_TTL_MS = 60_000;
const DEFAULT_FAILURE_CACHE_TTL_MS = 5_000;
const verificationCache = new Map<string, CachedVerification>();
const verificationInFlight = new Map<string, Promise<TucbsBrowserVerificationReport>>();

/**
 * Browser-only verification coordinator for source-IP-restricted TUCBS access.
 *
 * - The endpoint fingerprint is an opaque in-memory hash; signed URLs are never
 *   copied into reports, diagnostics or persistent cache keys.
 * - Concurrent verification of the same endpoint set shares one promise so a
 *   double click / React re-entry cannot create a request storm.
 * - Successful results are cached briefly. Failures have a deliberately short
 *   TTL so an IP/VPN/CORS correction can be retried quickly.
 */
export async function verifyTucbsBrowserAccess(
  endpoints: TucbsEndpointMap,
  options: TucbsBrowserVerificationOptions = {}
): Promise<TucbsBrowserVerificationReport> {
  const fingerprint = fingerprintEndpointMap(endpoints);
  const now = Date.now();

  if (!options.bypassCache) {
    const cached = verificationCache.get(fingerprint);
    if (cached && cached.expiresAt > now) return cached.report;
    if (cached) verificationCache.delete(fingerprint);

    const inFlight = verificationInFlight.get(fingerprint);
    if (inFlight) return inFlight;
  }

  const request = verifyTucbsEndpoints(endpoints, {
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency
  }).then((report) => {
    const enriched = enrichTucbsVerificationReport(report);
    const ttl = enriched.failed === 0
      ? clampCacheTtl(options.successCacheTtlMs ?? DEFAULT_SUCCESS_CACHE_TTL_MS)
      : clampCacheTtl(options.failureCacheTtlMs ?? DEFAULT_FAILURE_CACHE_TTL_MS);
    if (ttl > 0) verificationCache.set(fingerprint, { expiresAt: Date.now() + ttl, report: enriched });
    return enriched;
  }).finally(() => {
    verificationInFlight.delete(fingerprint);
  });

  verificationInFlight.set(fingerprint, request);
  return request;
}

export function enrichTucbsVerificationReport(report: TucbsVerificationReport): TucbsBrowserVerificationReport {
  const results = report.results.map(enrichEndpointVerification);
  const failureCounts: Partial<Record<TucbsVerificationFailureCode, number>> = {};

  for (const result of results) {
    if (result.ok || !result.failureCode) continue;
    failureCounts[result.failureCode] = (failureCounts[result.failureCode] ?? 0) + 1;
  }

  return {
    ...report,
    results,
    failureCounts
  };
}

export function selectVerifiedTucbsEndpoints(
  endpoints: TucbsEndpointMap,
  report: Pick<TucbsBrowserVerificationReport, "results">
): TucbsEndpointMap {
  const verified = new Set(report.results.filter((result) => result.ok).map((result) => result.key));
  const output: TucbsEndpointMap = {};

  for (const [key, url] of Object.entries(endpoints)) {
    if (!verified.has(key)) continue;
    output[key] = sanitizeTucbsUrl(url);
  }
  return output;
}

export function describeTucbsVerificationFailure(report: TucbsBrowserVerificationReport): string {
  if (report.verified > 0) {
    return `${report.verified}/${report.total} TUCBS servisi doğrulandı; ${report.failed} servis güvenli runtime kaydına alınmadı.`;
  }

  if (report.failureCounts["access-denied"]) {
    return "TUCBS erişimi sunucu tarafından reddedildi. Bu tarayıcının kullandığı dış IP'nin TUCBS tarafında onaylı olduğunu ve servis yetkisinin güncel olduğunu kontrol edin.";
  }
  if (report.failureCounts["browser-network"]) {
    return "Tarayıcı TUCBS sunucusuna ağ isteği kuramadı. VPN/proxy, kurumsal güvenlik duvarı, DNS veya tarayıcı CORS engelini kontrol edin; servis adresleri sunucuya gönderilmedi.";
  }
  if (report.failureCounts.timeout) {
    return "TUCBS bağlantısı zaman aşımına uğradı. Onaylı dış IP bağlantınızı ve ağ gecikmesini kontrol edip yeniden deneyin.";
  }
  if (report.failureCounts.throttled) {
    return "TUCBS servisi geçici olarak çok fazla istek yanıtı verdi. Kısa süre sonra yeniden deneyin.";
  }
  if (report.failureCounts["upstream-error"]) {
    return "TUCBS servisi geçici bir sunucu hatası döndürdü. Bağlantı bilgileri geçerli olabilir; kısa süre sonra yeniden deneyin.";
  }
  if (report.failureCounts["endpoint-not-found"]) {
    return "TUCBS servis adreslerinden biri artık bulunamıyor. Güncel yetkili servis JSON dosyasını kullanın.";
  }
  if (report.failureCounts["ogc-exception"] || report.failureCounts["invalid-capabilities"]) {
    return "TUCBS sunucusuna ulaşıldı ancak WMS/WFS yetenek yanıtı kullanılamadı. Servis türü ve yetkili servis tanımının güncel olduğunu kontrol edin.";
  }
  return "TUCBS servisleri bu tarayıcıdan doğrulanamadı. Onaylı dış IP bağlantınızı ve güncel yetkili servis JSON dosyanızı kontrol edin.";
}

export function clearTucbsBrowserVerificationCache(): void {
  verificationCache.clear();
  verificationInFlight.clear();
}

export function classifyTucbsVerificationFailure(reason?: string): {
  failureCode: TucbsVerificationFailureCode;
  guidance: string;
  retryable: boolean;
} {
  const normalized = (reason ?? "").trim();
  const httpStatus = /^HTTP\s+(\d{3})$/i.exec(normalized)?.[1];
  const status = httpStatus ? Number(httpStatus) : undefined;

  if (status === 401 || status === 403) {
    return {
      failureCode: "access-denied",
      guidance: "Dış IP izin listesi ve servis yetkisini kontrol edin.",
      retryable: false
    };
  }
  if (status === 404 || status === 410) {
    return {
      failureCode: "endpoint-not-found",
      guidance: "Güncel yetkili servis tanımını kullanın.",
      retryable: false
    };
  }
  if (status === 408 || status === 504) {
    return {
      failureCode: "timeout",
      guidance: "Ağ bağlantısını kontrol edip yeniden deneyin.",
      retryable: true
    };
  }
  if (status === 429) {
    return {
      failureCode: "throttled",
      guidance: "Kısa süre bekleyip yeniden deneyin.",
      retryable: true
    };
  }
  if (status && status >= 500) {
    return {
      failureCode: "upstream-error",
      guidance: "Servis geçici olarak hata veriyor; kısa süre sonra yeniden deneyin.",
      retryable: true
    };
  }
  if (status) {
    return {
      failureCode: "http-error",
      guidance: `TUCBS HTTP ${status} yanıtını verdi; servis tanımını ve erişim yetkisini kontrol edin.`,
      retryable: status >= 400 && status < 500 ? false : true
    };
  }
  if (/zaman aşımı/i.test(normalized)) {
    return {
      failureCode: "timeout",
      guidance: "Ağ bağlantısını kontrol edip yeniden deneyin.",
      retryable: true
    };
  }
  if (/ağ erişimi kurulamadı/i.test(normalized)) {
    return {
      failureCode: "browser-network",
      guidance: "VPN/proxy, güvenlik duvarı, DNS ve tarayıcı CORS politikasını kontrol edin.",
      retryable: true
    };
  }
  if (/OGC servis hata/i.test(normalized)) {
    return {
      failureCode: "ogc-exception",
      guidance: "Servis türü, yetki ve OGC yapılandırmasını kontrol edin.",
      retryable: false
    };
  }
  if (/Capabilities yanıtı/i.test(normalized)) {
    return {
      failureCode: "invalid-capabilities",
      guidance: "WMS/WFS servis türünü ve güncel endpoint tanımını kontrol edin.",
      retryable: false
    };
  }
  return {
    failureCode: "unknown",
    guidance: "Onaylı dış IP bağlantısını ve servis tanımını kontrol edin.",
    retryable: true
  };
}

function enrichEndpointVerification(result: TucbsEndpointVerification): TucbsBrowserEndpointVerification {
  if (result.ok) return result;
  return {
    ...result,
    ...classifyTucbsVerificationFailure(result.reason)
  };
}

function fingerprintEndpointMap(endpoints: TucbsEndpointMap): string {
  const normalized = Object.entries(endpoints)
    .map(([key, value]) => [key, sanitizeTucbsUrl(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  // FNV-1a is used only as an opaque in-memory dedupe key, not for security.
  // The signed endpoint itself never becomes a cache key or diagnostic string.
  let hash = 0x811c9dc5;
  for (const [key, value] of normalized) {
    const input = `${key}\u0000${value}\u0001`;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return `tucbs-v29-${(hash >>> 0).toString(16).padStart(8, "0")}-${normalized.length}`;
}

function clampCacheTtl(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(300_000, Math.max(0, Math.round(value)));
}

export type { TucbsEndpointMap, TucbsScaleProfileMap };
