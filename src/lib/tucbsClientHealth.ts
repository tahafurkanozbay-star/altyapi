import type { ServiceAccess, ServiceAvailability, ServiceDefinition } from "../types";
import {
  endpointKeyFor,
  isTucbsEndpointKey,
  isUnconfiguredTucbsUrl
} from "./tucbsAccess";
import type {
  TucbsBrowserVerificationReport,
  TucbsVerificationFailureCode
} from "./tucbsBrowserVerification";

const SESSION_KEY = "altyapi:tucbs-client-health:session:v30";
const PERSISTENT_KEY = "altyapi:tucbs-client-health:local:v30";
export const TUCBS_CLIENT_HEALTH_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_LATENCY_MS = 300_000;

const FAILURE_CODES = new Set<TucbsVerificationFailureCode>([
  "access-denied",
  "timeout",
  "browser-network",
  "endpoint-not-found",
  "throttled",
  "upstream-error",
  "ogc-exception",
  "invalid-capabilities",
  "http-error",
  "unknown"
]);

export interface TucbsClientHealthProfile {
  state: "verified" | "failed";
  checkedAt: string;
  latencyMs?: number;
  failureCode?: TucbsVerificationFailureCode;
  retryable?: boolean;
  capabilityVersion?: string;
  compatibilityFallback?: boolean;
}

export type TucbsClientHealthProfileMap = Record<string, TucbsClientHealthProfile>;

export function clientHealthProfilesFromVerification(
  report: Pick<TucbsBrowserVerificationReport, "results">,
  now = Date.now()
): TucbsClientHealthProfileMap {
  const checkedAt = new Date(now).toISOString();
  const output: TucbsClientHealthProfileMap = {};

  for (const result of report.results) {
    if (!isTucbsEndpointKey(result.key)) continue;
    output[result.key] = sanitizeProfile({
      state: result.ok ? "verified" : "failed",
      checkedAt,
      latencyMs: result.latencyMs,
      failureCode: result.ok ? undefined : result.failureCode,
      retryable: result.ok ? undefined : result.retryable,
      capabilityVersion: result.capabilityVersion,
      compatibilityFallback: result.compatibilityFallback
    });
  }

  return output;
}

export function loadTucbsClientHealthProfiles(): TucbsClientHealthProfileMap {
  return {
    ...readProfiles(safeStorage("localStorage"), PERSISTENT_KEY),
    ...readProfiles(safeStorage("sessionStorage"), SESSION_KEY)
  };
}

export function saveTucbsClientHealthProfiles(
  profiles: TucbsClientHealthProfileMap,
  remember: boolean
): void {
  const serialized = JSON.stringify(sanitizeProfileMap(profiles));
  const session = safeStorage("sessionStorage");
  if (session) safeSet(session, SESSION_KEY, serialized);

  const local = safeStorage("localStorage");
  if (!local) return;
  if (remember) safeSet(local, PERSISTENT_KEY, serialized);
  else safeRemove(local, PERSISTENT_KEY);
}

/** Refreshes the current browser session without changing the user's
 * persistence preference for the protected endpoint configuration. */
export function saveTucbsClientHealthSessionProfiles(profiles: TucbsClientHealthProfileMap): void {
  const session = safeStorage("sessionStorage");
  if (session) safeSet(session, SESSION_KEY, JSON.stringify(sanitizeProfileMap(profiles)));
}

export function clearTucbsClientHealthProfiles(): void {
  const session = safeStorage("sessionStorage");
  const local = safeStorage("localStorage");
  if (session) safeRemove(session, SESSION_KEY);
  if (local) safeRemove(local, PERSISTENT_KEY);
}

export function applyTucbsClientHealth(
  services: ServiceDefinition[],
  profiles: TucbsClientHealthProfileMap,
  now = Date.now()
): ServiceDefinition[] {
  return services.map((service) => applyTucbsClientHealthToService(service, profiles, now));
}

export function applyTucbsClientHealthToService(
  service: ServiceDefinition,
  profiles: TucbsClientHealthProfileMap,
  now = Date.now()
): ServiceDefinition {
  const key = service.tucbsEndpointKey ?? endpointKeyFor(service.displayName, service.kind);
  if (!key || isUnconfiguredTucbsUrl(service.url)) return service;

  const profile = profiles[key];
  if (!profile) return service;

  const stale = !isTucbsClientHealthFresh(profile, now);
  if (profile.state === "verified") {
    return {
      ...service,
      tucbsEndpointKey: key,
      availability: "verified",
      access: "public-browser",
      browserCompatible: true,
      verificationLatencyMs: profile.latencyMs,
      verificationReason: stale
        ? "Onaylı istemci IP'sinden daha önce doğrulandı; güncel erişim arka planda yeniden sınanıyor."
        : verifiedReason(profile),
      verifiedAt: profile.checkedAt,
      verificationStale: stale
    };
  }

  const availability = failedAvailability(service, profile, stale);
  return {
    ...service,
    tucbsEndpointKey: key,
    availability,
    access: failureAccess(profile.failureCode),
    browserCompatible: profile.failureCode === "browser-network" ? false : null,
    verificationLatencyMs: profile.latencyMs,
    verificationReason: failureReason(profile, stale),
    verifiedAt: profile.checkedAt,
    verificationStale: stale
  };
}

export function isTucbsClientHealthFresh(
  profile: TucbsClientHealthProfile,
  now = Date.now(),
  maxAgeMs = TUCBS_CLIENT_HEALTH_MAX_AGE_MS
): boolean {
  const checkedAt = Date.parse(profile.checkedAt);
  return Number.isFinite(checkedAt) && checkedAt <= now + 5 * 60_000 && now - checkedAt <= maxAgeMs;
}

function failedAvailability(
  service: ServiceDefinition,
  profile: TucbsClientHealthProfile,
  stale: boolean
): ServiceAvailability {
  // A stale failure should never become a long-lived circuit breaker: the
  // current browser/network may already be different and will be re-verified.
  if (stale || service.status === "ready") return "degraded";
  return profile.retryable === false ? "unavailable" : "degraded";
}

function failureAccess(code?: TucbsVerificationFailureCode): ServiceAccess {
  if (code === "browser-network") return "browser-blocked";
  if (code === "endpoint-not-found" || code === "upstream-error" || code === "ogc-exception" || code === "invalid-capabilities" || code === "http-error") {
    return "server-error";
  }
  return "network-restricted";
}

function verifiedReason(profile: TucbsClientHealthProfile): string {
  const compatibility = profile.compatibilityFallback && profile.capabilityVersion
    ? ` OGC ${profile.capabilityVersion} uyumluluk yanıtıyla doğrulandı.`
    : "";
  return `Onaylı dış IP üzerinden bu tarayıcıda doğrulandı.${compatibility}`.trim();
}

function failureReason(profile: TucbsClientHealthProfile, stale: boolean): string {
  if (stale) return "Önceki istemci doğrulaması artık eski; güncel dış IP ve servis erişimi yeniden sınanıyor.";
  const reasons: Record<TucbsVerificationFailureCode, string> = {
    "access-denied": "TUCBS bu tarayıcının mevcut dış IP/yetki erişimini reddetti.",
    timeout: "TUCBS istemci doğrulaması zaman aşımına uğradı.",
    "browser-network": "Tarayıcı TUCBS ağına istek kuramadı; VPN/proxy/CORS veya ağ politikası kontrol edilmeli.",
    "endpoint-not-found": "Yetkili TUCBS endpoint'i artık bulunamıyor.",
    throttled: "TUCBS geçici olarak istek hızını sınırlandırdı.",
    "upstream-error": "TUCBS upstream servisi geçici sunucu hatası döndürdü.",
    "ogc-exception": "TUCBS OGC servis yanıtı hata bildirdi.",
    "invalid-capabilities": "TUCBS capabilities yanıtı beklenen WMS/WFS biçiminde değildi.",
    "http-error": "TUCBS istemci doğrulaması HTTP hatasıyla tamamlandı.",
    unknown: "TUCBS istemci doğrulaması tamamlanamadı."
  };
  return reasons[profile.failureCode ?? "unknown"];
}

function sanitizeProfileMap(value: TucbsClientHealthProfileMap): TucbsClientHealthProfileMap {
  const output: TucbsClientHealthProfileMap = {};
  for (const [key, profile] of Object.entries(value)) {
    if (!isTucbsEndpointKey(key)) continue;
    try {
      output[key] = sanitizeProfile(profile);
    } catch {
      // Ignore malformed local data; it must never break catalog startup.
    }
  }
  return output;
}

function sanitizeProfile(profile: TucbsClientHealthProfile): TucbsClientHealthProfile {
  if (profile.state !== "verified" && profile.state !== "failed") throw new Error("Geçersiz TUCBS istemci sağlık durumu.");
  if (!profile.checkedAt || Number.isNaN(Date.parse(profile.checkedAt))) throw new Error("Geçersiz TUCBS istemci doğrulama zamanı.");

  const latencyMs = typeof profile.latencyMs === "number" && Number.isFinite(profile.latencyMs)
    ? Math.max(0, Math.min(MAX_LATENCY_MS, Math.round(profile.latencyMs)))
    : undefined;
  const failureCode = profile.failureCode && FAILURE_CODES.has(profile.failureCode)
    ? profile.failureCode
    : undefined;
  const capabilityVersion = typeof profile.capabilityVersion === "string" && /^\d+(?:\.\d+){1,2}$/.test(profile.capabilityVersion)
    ? profile.capabilityVersion
    : undefined;

  return {
    state: profile.state,
    checkedAt: new Date(profile.checkedAt).toISOString(),
    latencyMs,
    failureCode: profile.state === "failed" ? failureCode : undefined,
    retryable: profile.state === "failed" && typeof profile.retryable === "boolean" ? profile.retryable : undefined,
    capabilityVersion,
    compatibilityFallback: profile.compatibilityFallback === true ? true : undefined
  };
}

function readProfiles(storage: Storage | null, key: string): TucbsClientHealthProfileMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return sanitizeProfileMap(parsed as TucbsClientHealthProfileMap);
  } catch {
    return {};
  }
}

function safeStorage(name: "localStorage" | "sessionStorage"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window[name];
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value); } catch { /* quota/private mode */ }
}

function safeRemove(storage: Storage, key: string): void {
  try { storage.removeItem(key); } catch { /* storage restrictions */ }
}
