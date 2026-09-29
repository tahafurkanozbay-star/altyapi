import type {
  ServiceAccess,
  ServiceAvailability,
  ServiceDefinition,
  ServiceHealthSnapshot,
  ServiceVerificationEntry
} from "../types";
import { isDirectTucbsUrl, isUnconfiguredTucbsUrl } from "./tucbsAccess";
import {
  applyTucbsClientHealth,
  loadTucbsClientHealthProfiles
} from "./tucbsClientHealth";

const AVAILABILITY = new Set<ServiceAvailability>(["verified", "degraded", "unavailable", "unknown"]);
const ACCESS = new Set<ServiceAccess>(["public-browser", "browser-blocked", "network-restricted", "server-error", "unknown"]);
export const SERVICE_HEALTH_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export async function loadServiceHealthSnapshot(url = "./service-health.json", signal?: AbortSignal): Promise<ServiceHealthSnapshot | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return parseServiceHealthSnapshot(value);
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

export function parseServiceHealthSnapshot(value: unknown): ServiceHealthSnapshot {
  if (!value || typeof value !== "object") throw new Error("Servis sağlık özeti geçersiz.");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || !Array.isArray(input.services)) {
    throw new Error("Desteklenmeyen servis sağlık özeti biçimi.");
  }

  const generatedAt = typeof input.generatedAt === "string" && !Number.isNaN(Date.parse(input.generatedAt))
    ? input.generatedAt
    : new Date(0).toISOString();

  const services: ServiceVerificationEntry[] = input.services.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.index !== "number" || !Number.isInteger(record.index) || typeof record.name !== "string" || typeof record.kind !== "string") return [];
    if (!AVAILABILITY.has(record.availability as ServiceAvailability)) return [];
    if (!ACCESS.has(record.access as ServiceAccess)) return [];
    const browserCompatible =
      typeof record.browserCompatible === "boolean" ? record.browserCompatible :
      record.browserCompatible === null ? null :
      undefined;
    return [{
      index: Number(record.index),
      name: record.name,
      kind: record.kind as ServiceVerificationEntry["kind"],
      availability: record.availability as ServiceAvailability,
      access: record.access as ServiceAccess,
      browserCompatible,
      latencyMs: typeof record.latencyMs === "number" && Number.isFinite(record.latencyMs) && record.latencyMs >= 0
        ? Math.round(record.latencyMs)
        : undefined,
      reason: typeof record.reason === "string" ? record.reason.slice(0, 240) : undefined
    }];
  });

  return {
    schemaVersion: 1,
    generatedAt,
    source: typeof input.source === "string" ? input.source.slice(0, 120) : "unknown",
    services
  };
}

export function applyServiceHealthSnapshot(
  services: ServiceDefinition[],
  snapshot: ServiceHealthSnapshot | null,
  now = Date.now()
): ServiceDefinition[] {
  const publicRunnerCatalog = snapshot
    ? applyPublicRunnerHealth(services, snapshot, now)
    : services;

  // Public GitHub runners cannot prove source-IP-restricted TUCBS access. A
  // sanitized endpoint-key-only browser profile therefore overlays the public
  // snapshot only for locally configured TUCBS rows. No protected URL crosses
  // into service-health.json or this client-health store.
  return applyTucbsClientHealth(publicRunnerCatalog, loadTucbsClientHealthProfiles(), now);
}

function applyPublicRunnerHealth(
  services: ServiceDefinition[],
  snapshot: ServiceHealthSnapshot,
  now: number
): ServiceDefinition[] {
  const stale = !isServiceHealthSnapshotFresh(snapshot, now);
  const entries = new Map(snapshot.services.map((entry) => [entry.index, entry]));
  return services.map((service, index) => {
    const entry = entries.get(index);
    if (!entry || entry.name !== service.displayName || entry.kind !== service.kind) return service;
    return {
      ...service,
      availability: entry.availability,
      access: entry.access,
      browserCompatible: entry.browserCompatible,
      verificationLatencyMs: entry.latencyMs,
      verificationReason: entry.reason,
      verifiedAt: snapshot.generatedAt,
      verificationStale: stale
    };
  });
}

export function shouldAutoLoadService(service: ServiceDefinition, now = Date.now()): boolean {
  if (isUnconfiguredTucbsUrl(service.url)) return false;
  if (isServiceCoolingDown(service, now)) return false;
  if (service.verificationStale) return true;
  if (service.availability === "verified" || service.availability === "unknown") return true;

  // A public GitHub runner cannot prove reachability from the citizen's actual
  // network. For non-TUCBS services, a runner timeout/network restriction is
  // therefore a retry hint rather than a startup circuit breaker. The browser
  // gets one real attempt and normal runtime retry/cooldown still applies if it
  // cannot reach the service either.
  return !isDirectTucbsUrl(service.url)
    && service.availability === "degraded"
    && service.access === "network-restricted";
}

export function isServiceHealthSnapshotFresh(
  snapshot: ServiceHealthSnapshot,
  now = Date.now(),
  maxAgeMs = SERVICE_HEALTH_MAX_AGE_MS
): boolean {
  const generatedAt = Date.parse(snapshot.generatedAt);
  return Number.isFinite(generatedAt) && generatedAt <= now + 5 * 60_000 && now - generatedAt <= maxAgeMs;
}

export function isServiceCoolingDown(service: ServiceDefinition, now = Date.now()): boolean {
  if (!service.cooldownUntil) return false;
  const deadline = Date.parse(service.cooldownUntil);
  return Number.isFinite(deadline) && deadline > now;
}

export function failurePatch(
  service: ServiceDefinition,
  error: string | undefined,
  durationMs: number | undefined,
  now = Date.now()
): Partial<ServiceDefinition> {
  const failureCount = Math.max(0, service.failureCount ?? 0) + 1;
  const cooldownMs = failureCount < 2 ? 0 : Math.min(15 * 60_000, 30_000 * 2 ** Math.min(5, failureCount - 2));
  return {
    visible: false,
    status: "error",
    error,
    latencyMs: durationMs,
    lastLoadedAt: new Date(now).toISOString(),
    lastFailureAt: new Date(now).toISOString(),
    failureCount,
    cooldownUntil: cooldownMs ? new Date(now + cooldownMs).toISOString() : undefined
  };
}

export function successPatch(durationMs: number | undefined, now = Date.now()): Partial<ServiceDefinition> {
  const verifiedAt = new Date(now).toISOString();
  const measuredLatency = typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0
    ? Math.round(durationMs)
    : undefined;

  // A successful ArcGIS/OGC Layer.load() happened inside the actual browser,
  // so it is stronger reachability evidence than a public-runner snapshot.
  // This state is runtime-local; no endpoint or credential is persisted here.
  return {
    status: "ready",
    error: undefined,
    latencyMs: durationMs,
    lastLoadedAt: verifiedAt,
    availability: "verified",
    access: "public-browser",
    browserCompatible: true,
    verificationLatencyMs: measuredLatency,
    verificationReason: "Bu tarayıcı ve mevcut ağ üzerinden katman başarıyla yüklendi.",
    verifiedAt,
    verificationStale: false,
    failureCount: 0,
    cooldownUntil: undefined,
    lastFailureAt: undefined
  };
}

export function availabilityLabel(service: ServiceDefinition): string {
  if (isUnconfiguredTucbsUrl(service.url)) return "Yetkili bağlantı gerekli";
  if (isDirectTucbsUrl(service.url) && service.access === "public-browser" && service.availability === "verified") {
    return service.verificationStale ? "Onaylı IP’den doğrulandı · eski" : "Onaylı IP’den doğrulandı";
  }
  if (isDirectTucbsUrl(service.url) && service.access === "network-restricted") return "IP yetkili erişim";

  const suffix = service.verificationStale ? " · eski" : "";
  if (service.availability === "verified") return `Doğrulandı${suffix}`;
  if (service.availability === "degraded") return `Kısıtlı erişim${suffix}`;
  if (service.availability === "unavailable") return `Ulaşılamıyor${suffix}`;
  return "Doğrulanmadı";
}

export function cooldownRemaining(service: ServiceDefinition, now = Date.now()): string | null {
  if (!isServiceCoolingDown(service, now) || !service.cooldownUntil) return null;
  const remaining = Math.max(0, Date.parse(service.cooldownUntil) - now);
  if (remaining < 60_000) return `${Math.max(1, Math.ceil(remaining / 1000))} sn`;
  return `${Math.ceil(remaining / 60_000)} dk`;
}
