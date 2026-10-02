import type {
  ServiceAccess,
  ServiceAvailability,
  ServiceDefinition,
  ServiceHealthSnapshot,
  ServiceKind,
  ServiceVerificationEntry
} from "../types";
import {
  asRecord,
  readArray,
  readEnum,
  readFiniteNumber,
  readIsoDate,
  readNullableBoolean,
  readString
} from "../platform/runtimeContracts";
import { isDirectTucbsUrl, isUnconfiguredTucbsUrl } from "./tucbsAccess";
import {
  applyTucbsClientHealth,
  loadTucbsClientHealthProfiles
} from "./tucbsClientHealth";
import {
  applyBrowserServiceHealth,
  loadBrowserServiceHealthProfiles
} from "./browserServiceHealth";

const AVAILABILITY = new Set<ServiceAvailability>(["verified", "degraded", "unavailable", "unknown"]);
const ACCESS = new Set<ServiceAccess>(["public-browser", "browser-blocked", "network-restricted", "server-error", "unknown"]);
const SERVICE_KINDS = new Set<ServiceKind>(["WMS", "WFS", "MapServer", "FeatureServer", "SceneServer"]);
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
  const input = asRecord(value);
  if (!input) throw new Error("Servis sağlık özeti geçersiz.");
  const servicesInput = readArray(input, "services");
  if (input.schemaVersion !== 1 || !servicesInput) {
    throw new Error("Desteklenmeyen servis sağlık özeti biçimi.");
  }

  const generatedAt = readIsoDate(input, "generatedAt") ?? new Date(0).toISOString();
  const services: ServiceVerificationEntry[] = servicesInput.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];

    const index = readFiniteNumber(record, "index", { min: 0, integer: true });
    const name = readString(record, "name", { trim: true, nonEmpty: true, maxLength: 240 });
    const kind = readEnum(record, "kind", SERVICE_KINDS);
    const availability = readEnum(record, "availability", AVAILABILITY);
    const access = readEnum(record, "access", ACCESS);
    if (index === undefined || !name || !kind || !availability || !access) return [];

    const browserCompatible = readNullableBoolean(record, "browserCompatible");
    const latency = readFiniteNumber(record, "latencyMs", { min: 0 });
    const reason = readString(record, "reason", { maxLength: 240 });

    return [{
      index,
      name,
      kind,
      availability,
      access,
      browserCompatible,
      latencyMs: latency === undefined ? undefined : Math.round(latency),
      reason
    }];
  });

  return {
    schemaVersion: 1,
    generatedAt,
    source: readString(input, "source", { maxLength: 120 }) ?? "unknown",
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

  // A recent stable LayerView in this exact browser/network is stronger evidence
  // than a public CI runner's reachability result. The local proof stores only
  // anonymous service IDs and timestamps; no provider URL or credential is kept.
  const browserCatalog = applyBrowserServiceHealth(
    publicRunnerCatalog,
    loadBrowserServiceHealthProfiles(undefined, now),
    now
  );

  // Public GitHub runners cannot prove source-IP-restricted TUCBS access. A
  // sanitized endpoint-key-only browser profile therefore remains the final,
  // dedicated authority for locally configured TUCBS rows.
  return applyTucbsClientHealth(browserCatalog, loadTucbsClientHealthProfiles(), now);
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

    // Once the runner snapshot is outside its freshness window it becomes
    // provenance only. Carrying an old degraded/unavailable state into the load
    // scheduler can unfairly penalize a service that is healthy on the citizen's
    // current network, while an old verified state can be equally misleading.
    if (stale) {
      return {
        ...service,
        verificationReason: entry.reason,
        verifiedAt: snapshot.generatedAt,
        verificationStale: true
      };
    }

    return {
      ...service,
      availability: entry.availability,
      access: entry.access,
      browserCompatible: entry.browserCompatible,
      verificationLatencyMs: entry.latencyMs,
      verificationReason: entry.reason,
      verifiedAt: snapshot.generatedAt,
      verificationStale: false
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
  // This state is runtime-local; v46 separately remembers only stable rendered
  // public service IDs, never endpoint URLs or credentials.
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
