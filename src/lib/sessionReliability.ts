import type { IncidentKind, RuntimeIncident } from "../types";

export type ReliabilityTrend = "improving" | "stable" | "degrading";

export interface IncidentReliabilitySummary {
  windowMs: number;
  total: number;
  errors: number;
  warnings: number;
  recovered: number;
  recoveryRate: number;
  averageDurationMs?: number;
  p95DurationMs?: number;
  byKind: Record<IncidentKind, number>;
  trend: ReliabilityTrend;
  score: number;
}

const KINDS: IncidentKind[] = ["boot", "network", "layer-load", "layer-retry", "query", "system"];

export function summarizeIncidentReliability(
  incidents: RuntimeIncident[],
  now = Date.now(),
  windowMs = 60 * 60 * 1000
): IncidentReliabilitySummary {
  const current = withinWindow(incidents, now - windowMs, now);
  const previous = withinWindow(incidents, now - 2 * windowMs, now - windowMs);
  const durations = current
    .map((incident) => incident.durationMs)
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);

  const errors = current.filter((incident) => incident.severity === "error").length;
  const warnings = current.filter((incident) => incident.severity === "warning").length;
  const recovered = current.filter((incident) => incident.recovered).length;
  const recoverable = current.filter((incident) => incident.severity === "error" || incident.recovered).length;
  const currentWeight = weightedSeverity(current);
  const previousWeight = weightedSeverity(previous);

  const score = clamp(
    100
      - errors * 12
      - warnings * 5
      - Math.max(0, currentWeight - previousWeight) * 2
      + Math.min(12, recovered * 3),
    0,
    100
  );

  return {
    windowMs,
    total: current.length,
    errors,
    warnings,
    recovered,
    recoveryRate: recoverable ? Math.round((recovered / recoverable) * 100) : 100,
    averageDurationMs: durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : undefined,
    p95DurationMs: durations.length ? percentile(durations, 0.95) : undefined,
    byKind: Object.fromEntries(KINDS.map((kind) => [kind, current.filter((incident) => incident.kind === kind).length])) as Record<IncidentKind, number>,
    trend: trendFromWeights(currentWeight, previousWeight),
    score
  };
}

export function filterIncidents(
  incidents: RuntimeIncident[],
  options: {
    severity?: RuntimeIncident["severity"] | "all";
    kind?: IncidentKind | "all";
    sinceMs?: number;
    now?: number;
  } = {}
): RuntimeIncident[] {
  const now = options.now ?? Date.now();
  const minTime = options.sinceMs ? now - Math.max(0, options.sinceMs) : Number.NEGATIVE_INFINITY;
  return incidents.filter((incident) => {
    if (options.severity && options.severity !== "all" && incident.severity !== options.severity) return false;
    if (options.kind && options.kind !== "all" && incident.kind !== options.kind) return false;
    const occurredAt = Date.parse(incident.occurredAt);
    return Number.isFinite(occurredAt) && occurredAt >= minTime && occurredAt <= now + 5 * 60_000;
  });
}

export function reliabilityTrendLabel(trend: ReliabilityTrend): string {
  if (trend === "improving") return "İyileşiyor";
  if (trend === "degrading") return "Bozuluyor";
  return "Stabil";
}

function withinWindow(incidents: RuntimeIncident[], start: number, end: number): RuntimeIncident[] {
  return incidents.filter((incident) => {
    const time = Date.parse(incident.occurredAt);
    return Number.isFinite(time) && time >= start && time < end;
  });
}

function weightedSeverity(incidents: RuntimeIncident[]): number {
  return incidents.reduce((sum, incident) => {
    if (incident.severity === "error") return sum + 3;
    if (incident.severity === "warning") return sum + 1;
    return sum;
  }, 0);
}

function trendFromWeights(current: number, previous: number): ReliabilityTrend {
  if (current + 1 < previous) return "improving";
  if (current > previous + 1) return "degrading";
  return "stable";
}

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
