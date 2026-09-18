import { describe, expect, it } from "vitest";
import { latencyLabel, summarizeServiceHealth } from "../src/lib/serviceMetrics";
import type { ServiceDefinition } from "../src/types";

function service(id: string, status: ServiceDefinition["status"], latencyMs?: number): ServiceDefinition {
  return {
    id,
    kind: "FeatureServer",
    displayName: id,
    organization: "ABB",
    owner: "ABB",
    url: "https://example.com/FeatureServer/0",
    status,
    visible: status === "ready",
    opacity: 1,
    favorite: false,
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: id,
    servisTuruAdi: "FeatureServer",
    tokenUrl: "https://example.com/FeatureServer/0",
    latencyMs
  };
}

describe("serviceMetrics", () => {
  it("summarizes health and latency", () => {
    const summary = summarizeServiceHealth([
      service("a", "ready", 100),
      service("b", "ready", 500),
      service("c", "error", 2500),
      service("d", "idle")
    ]);
    expect(summary.ready).toBe(2);
    expect(summary.error).toBe(1);
    expect(summary.active).toBe(2);
    expect(summary.averageLatencyMs).toBe(1033);
    expect(summary.p95LatencyMs).toBe(2500);
  });

  it("labels service latency consistently", () => {
    expect(latencyLabel(120)).toBe("Hızlı");
    expect(latencyLabel(800)).toBe("Normal");
    expect(latencyLabel(2000)).toBe("Yavaş");
    expect(latencyLabel(4500)).toBe("Çok yavaş");
  });
});
