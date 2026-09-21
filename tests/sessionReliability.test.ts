import { describe, expect, it } from "vitest";
import { filterIncidents, reliabilityTrendLabel, summarizeIncidentReliability } from "../src/lib/sessionReliability";
import type { RuntimeIncident } from "../src/types";

const now = Date.parse("2026-09-21T10:00:00.000Z");

function incident(
  minutesAgo: number,
  severity: RuntimeIncident["severity"],
  overrides: Partial<RuntimeIncident> = {}
): RuntimeIncident {
  return {
    id: `i-${minutesAgo}-${severity}`,
    occurredAt: new Date(now - minutesAgo * 60_000).toISOString(),
    severity,
    kind: "layer-load",
    message: "test",
    ...overrides
  };
}

describe("session reliability analytics", () => {
  it("summarizes a bounded time window and durations", () => {
    const incidents = [
      incident(10, "error", { durationMs: 2200 }),
      incident(20, "warning", { durationMs: 800 }),
      incident(30, "info", { recovered: true, durationMs: 300 }),
      incident(90, "error", { durationMs: 5000 })
    ];

    const summary = summarizeIncidentReliability(incidents, now, 60 * 60 * 1000);
    expect(summary.total).toBe(3);
    expect(summary.errors).toBe(1);
    expect(summary.warnings).toBe(1);
    expect(summary.recovered).toBe(1);
    expect(summary.p95DurationMs).toBe(2200);
    expect(summary.score).toBeGreaterThanOrEqual(0);
    expect(summary.score).toBeLessThanOrEqual(100);
  });

  it("detects improvement when the previous window was noisier", () => {
    const incidents = [
      incident(10, "warning"),
      incident(70, "error"),
      incident(80, "error")
    ];
    const summary = summarizeIncidentReliability(incidents, now, 60 * 60 * 1000);
    expect(summary.trend).toBe("improving");
    expect(reliabilityTrendLabel(summary.trend)).toBe("İyileşiyor");
  });

  it("filters by severity, kind and time window", () => {
    const incidents = [
      incident(10, "error", { kind: "query" }),
      incident(20, "error", { kind: "layer-load" }),
      incident(200, "error", { kind: "query" })
    ];
    const filtered = filterIncidents(incidents, {
      severity: "error",
      kind: "query",
      sinceMs: 60 * 60 * 1000,
      now
    });
    expect(filtered.map((item) => item.kind)).toEqual(["query"]);
    expect(filtered).toHaveLength(1);
  });
});
