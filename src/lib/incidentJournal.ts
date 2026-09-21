import type { IncidentKind, IncidentSeverity, RuntimeIncident } from "../types";

export const INCIDENT_STORAGE_KEY = "altyapi:incidents:v1";
export const MAX_INCIDENTS = 80;

interface IncidentInput {
  severity: IncidentSeverity;
  kind: IncidentKind;
  message: string;
  serviceId?: string;
  serviceName?: string;
  durationMs?: number;
  recovered?: boolean;
}

export function createIncident(input: IncidentInput, now = new Date()): RuntimeIncident {
  return {
    id: createId(now),
    occurredAt: now.toISOString(),
    severity: input.severity,
    kind: input.kind,
    message: sanitizeIncidentText(input.message),
    serviceId: safeIdentifier(input.serviceId),
    serviceName: input.serviceName ? sanitizeIncidentText(input.serviceName).slice(0, 120) : undefined,
    durationMs: Number.isFinite(input.durationMs) && (input.durationMs ?? -1) >= 0
      ? Math.round(input.durationMs!)
      : undefined,
    recovered: input.recovered === true ? true : undefined
  };
}

export function loadIncidentJournal(): RuntimeIncident[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(INCIDENT_STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap(parseIncident).slice(0, MAX_INCIDENTS);
  } catch {
    return [];
  }
}

export function persistIncidentJournal(incidents: RuntimeIncident[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(incidents.slice(0, MAX_INCIDENTS)));
  } catch {
    // Storage can be disabled by browser policy or quota.
  }
}

export function appendIncident(
  incidents: RuntimeIncident[],
  incident: RuntimeIncident
): RuntimeIncident[] {
  const next = [incident, ...incidents.filter((item) => item.id !== incident.id)].slice(0, MAX_INCIDENTS);
  persistIncidentJournal(next);
  return next;
}

export function clearIncidentJournal(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(INCIDENT_STORAGE_KEY);
  } catch {
    // Ignore policy-restricted storage.
  }
}

export function incidentJournalToJson(incidents: RuntimeIncident[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    application: "Başkent 3B CBS",
    exportedAt: new Date().toISOString(),
    count: incidents.length,
    incidents: incidents.map((incident) => ({
      ...incident,
      message: sanitizeIncidentText(incident.message),
      serviceName: incident.serviceName ? sanitizeIncidentText(incident.serviceName) : undefined
    }))
  }, null, 2);
}

export function sanitizeIncidentText(value: string): string {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/([?&](?:token|key|apikey|api_key|access_token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/[A-Za-z0-9_-]{64,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function parseIncident(value: unknown): RuntimeIncident[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.occurredAt !== "string" ||
    Number.isNaN(Date.parse(item.occurredAt)) ||
    !isSeverity(item.severity) ||
    !isKind(item.kind) ||
    typeof item.message !== "string"
  ) return [];

  return [{
    id: item.id.slice(0, 100),
    occurredAt: item.occurredAt,
    severity: item.severity,
    kind: item.kind,
    message: sanitizeIncidentText(item.message),
    serviceId: typeof item.serviceId === "string" ? safeIdentifier(item.serviceId) : undefined,
    serviceName: typeof item.serviceName === "string" ? sanitizeIncidentText(item.serviceName).slice(0, 120) : undefined,
    durationMs: typeof item.durationMs === "number" && Number.isFinite(item.durationMs) && item.durationMs >= 0
      ? Math.round(item.durationMs)
      : undefined,
    recovered: item.recovered === true ? true : undefined
  }];
}

function isSeverity(value: unknown): value is IncidentSeverity {
  return value === "info" || value === "warning" || value === "error";
}

function isKind(value: unknown): value is IncidentKind {
  return value === "boot" || value === "network" || value === "layer-load" || value === "layer-retry" || value === "query" || value === "system";
}

function safeIdentifier(value?: string): string | undefined {
  if (!value) return undefined;
  const safe = value.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 160);
  return safe || undefined;
}

function createId(now: Date): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
