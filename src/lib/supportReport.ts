import { sanitizeIncidentText } from "./incidentJournal";
import { summarizeServiceHealth } from "./serviceMetrics";
import type { RuntimeIncident, ServiceDefinition } from "../types";

export interface CitizenSupportReport {
  schemaVersion: 1;
  application: "Ankara Kent Rehberi";
  generatedAt: string;
  online: boolean;
  summary: {
    total: number;
    active: number;
    ready: number;
    loading: number;
    error: number;
    verified: number;
    degraded: number;
    unavailable: number;
    coolingDown: number;
  };
  services: Array<{
    name: string;
    kind: ServiceDefinition["kind"];
    status: ServiceDefinition["status"];
    availability: ServiceDefinition["availability"];
    access: ServiceDefinition["access"];
    visible: boolean;
    latencyMs?: number;
    failureCount: number;
    verifiedAt?: string;
    verificationStale?: boolean;
  }>;
  incidents: Array<{
    occurredAt: string;
    severity: RuntimeIncident["severity"];
    kind: RuntimeIncident["kind"];
    message: string;
    serviceName?: string;
    durationMs?: number;
    recovered?: boolean;
    occurrences?: number;
  }>;
}

export function createCitizenSupportReport(
  services: ServiceDefinition[],
  incidents: RuntimeIncident[],
  online: boolean,
  now = new Date()
): CitizenSupportReport {
  const health = summarizeServiceHealth(services);
  return {
    schemaVersion: 1,
    application: "Ankara Kent Rehberi",
    generatedAt: now.toISOString(),
    online,
    summary: {
      total: services.length,
      active: health.active,
      ready: health.ready,
      loading: health.loading,
      error: health.error,
      verified: health.verified,
      degraded: health.degraded,
      unavailable: health.unavailable,
      coolingDown: health.coolingDown
    },
    services: services.map((service) => ({
      name: sanitizeIncidentText(service.displayName).slice(0, 120),
      kind: service.kind,
      status: service.status,
      availability: service.availability,
      access: service.access,
      visible: service.visible,
      latencyMs: safeDuration(service.latencyMs),
      failureCount: Math.max(0, Math.min(999, Math.round(service.failureCount || 0))),
      verifiedAt: safeIso(service.verifiedAt),
      verificationStale: service.verificationStale === true ? true : undefined
    })),
    incidents: incidents.slice(0, 80).map((incident) => ({
      occurredAt: safeIso(incident.occurredAt) ?? now.toISOString(),
      severity: incident.severity,
      kind: incident.kind,
      message: sanitizeIncidentText(incident.message),
      serviceName: incident.serviceName ? sanitizeIncidentText(incident.serviceName).slice(0, 120) : undefined,
      durationMs: safeDuration(incident.durationMs),
      recovered: incident.recovered === true ? true : undefined,
      occurrences: Number.isInteger(incident.occurrences) && (incident.occurrences ?? 0) > 1
        ? Math.min(999, incident.occurrences!)
        : undefined
    }))
  };
}

export function citizenSupportReportToJson(report: CitizenSupportReport): string {
  return JSON.stringify(report, null, 2);
}

function safeDuration(value?: number): number | undefined {
  return Number.isFinite(value) && value! >= 0 ? Math.min(120_000, Math.round(value!)) : undefined;
}

function safeIso(value?: string): string | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}
