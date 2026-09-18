import type {
  ServiceAccess,
  ServiceAvailability,
  ServiceDefinition,
  ServiceHealthSnapshot,
  ServiceVerificationEntry
} from "../types";

const AVAILABILITY = new Set<ServiceAvailability>(["verified", "degraded", "unavailable", "unknown"]);
const ACCESS = new Set<ServiceAccess>(["public-browser", "network-restricted", "server-error", "unknown"]);

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
    if (!Number.isInteger(record.index) || typeof record.name !== "string" || typeof record.kind !== "string") return [];
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
  snapshot: ServiceHealthSnapshot | null
): ServiceDefinition[] {
  if (!snapshot) return services;

  const entries = new Map(snapshot.services.map((entry) => [entry.index, entry]));
  return services.map((service, index) => {
    const entry = entries.get(index);
    if (!entry || entry.name !== service.displayName || entry.kind !== service.kind) return service;
    return {
      ...service,
      availability: entry.availability,
      access: entry.access,
      browserCompatible: entry.browserCompatible,
      verificationReason: entry.reason,
      verifiedAt: snapshot.generatedAt
    };
  });
}

export function shouldAutoLoadService(service: ServiceDefinition, now = Date.now()): boolean {
  if (isServiceCoolingDown(service, now)) return false;
  return service.availability === "verified" || service.availability === "unknown";
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
  return {
    status: "ready",
    error: undefined,
    latencyMs: durationMs,
    lastLoadedAt: new Date(now).toISOString(),
    failureCount: 0,
    cooldownUntil: undefined,
    lastFailureAt: undefined
  };
}

export function availabilityLabel(service: ServiceDefinition): string {
  if (service.availability === "verified") return "Doğrulandı";
  if (service.availability === "degraded") return "Kısıtlı erişim";
  if (service.availability === "unavailable") return "Ulaşılamıyor";
  return "Doğrulanmadı";
}

export function cooldownRemaining(service: ServiceDefinition, now = Date.now()): string | null {
  if (!isServiceCoolingDown(service, now) || !service.cooldownUntil) return null;
  const remaining = Math.max(0, Date.parse(service.cooldownUntil) - now);
  if (remaining < 60_000) return `${Math.max(1, Math.ceil(remaining / 1000))} sn`;
  return `${Math.ceil(remaining / 60_000)} dk`;
}
