import { applyServiceHealthSnapshot, parseServiceHealthSnapshot } from "./serviceHealth";
import type {
  LiveHealthSource,
  ServiceDefinition,
  ServiceHealthChange,
  ServiceHealthSnapshot
} from "../types";

export const LIVE_HEALTH_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
export const LIVE_HEALTH_CHANNEL = "altyapi:live-health:v1";
export const LIVE_HEALTH_LOCK = "altyapi:live-health-refresh";

export interface LiveHealthMessage {
  type: "service-health";
  sentAt: string;
  source: LiveHealthSource;
  snapshot: ServiceHealthSnapshot;
}

export interface AppliedLiveHealth {
  services: ServiceDefinition[];
  changes: ServiceHealthChange[];
}

export function applyLiveHealthSnapshot(
  services: ServiceDefinition[],
  snapshot: ServiceHealthSnapshot,
  now = Date.now()
): AppliedLiveHealth {
  const next = applyServiceHealthSnapshot(services, snapshot, now);
  return {
    services: next,
    changes: diffServiceHealth(services, next)
  };
}

export function diffServiceHealth(
  previous: ServiceDefinition[],
  next: ServiceDefinition[]
): ServiceHealthChange[] {
  const previousById = new Map(previous.map((service) => [service.id, service]));
  const changes: ServiceHealthChange[] = [];

  for (const service of next) {
    const before = previousById.get(service.id);
    if (!before) continue;
    if (before.availability === service.availability && before.access === service.access) continue;
    changes.push({
      serviceId: service.id,
      serviceName: service.displayName,
      fromAvailability: before.availability,
      toAvailability: service.availability,
      fromAccess: before.access,
      toAccess: service.access
    });
  }

  return changes;
}

export function shouldRefreshLiveHealth(
  lastSuccessAt: string | undefined,
  now = Date.now(),
  intervalMs = LIVE_HEALTH_REFRESH_INTERVAL_MS
): boolean {
  if (!lastSuccessAt) return true;
  const last = Date.parse(lastSuccessAt);
  if (!Number.isFinite(last)) return true;
  return now - last >= intervalMs;
}

export function liveHealthChangeMessage(change: ServiceHealthChange): string {
  const availability = change.fromAvailability === change.toAvailability
    ? change.toAvailability
    : `${change.fromAvailability} → ${change.toAvailability}`;
  const access = change.fromAccess === change.toAccess
    ? change.toAccess
    : `${change.fromAccess} → ${change.toAccess}`;
  return `${change.serviceName}: ${availability} · ${access}`;
}

export function healthChangeSeverity(change: ServiceHealthChange): "info" | "warning" | "error" {
  if (change.toAvailability === "unavailable" || change.toAccess === "server-error") return "error";
  if (
    change.toAvailability === "degraded" ||
    change.toAccess === "browser-blocked" ||
    change.toAccess === "network-restricted"
  ) return "warning";
  return "info";
}

export function createLiveHealthMessage(
  snapshot: ServiceHealthSnapshot,
  source: LiveHealthSource = "network",
  now = new Date()
): LiveHealthMessage {
  return {
    type: "service-health",
    sentAt: now.toISOString(),
    source,
    snapshot
  };
}

export function parseLiveHealthMessage(value: unknown): LiveHealthMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "service-health" || typeof record.sentAt !== "string") return null;
  if (!isLiveHealthSource(record.source)) return null;

  try {
    const snapshot = parseServiceHealthSnapshot(record.snapshot);
    return {
      type: "service-health",
      sentAt: record.sentAt,
      source: record.source,
      snapshot
    };
  } catch {
    return null;
  }
}

export async function withLiveHealthLock<T>(task: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!lockManager) return task();
  return lockManager.request(LIVE_HEALTH_LOCK, { mode: "exclusive" }, task);
}

function isLiveHealthSource(value: unknown): value is LiveHealthSource {
  return value === "boot" || value === "network" || value === "broadcast" || value === "offline-cache";
}
