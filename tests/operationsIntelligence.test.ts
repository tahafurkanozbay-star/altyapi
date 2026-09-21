import { describe, expect, it } from "vitest";
import {
  operationalRecommendations,
  rankServicesByReadiness,
  readinessGrade,
  serviceReadiness,
  summarizeOperationalReadiness
} from "../src/lib/operationsIntelligence";
import type { ServiceDefinition } from "../src/types";

function service(overrides: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id: "svc-a",
    kind: "FeatureServer",
    displayName: "Katman A",
    organization: "ABB",
    owner: "ABB",
    url: "https://example.com/FeatureServer/0",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: "Katman A",
    servisTuruAdi: "FeatureServer",
    tokenUrl: "https://example.com/FeatureServer/0",
    ...overrides
  };
}

describe("operations intelligence", () => {
  it("scores verified browser-ready services above unavailable services", () => {
    const strong = service({
      id: "strong",
      availability: "verified",
      access: "public-browser",
      status: "ready",
      visible: true,
      latencyMs: 220,
      verificationLatencyMs: 180
    });
    const weak = service({
      id: "weak",
      availability: "unavailable",
      access: "server-error",
      status: "error",
      failureCount: 3,
      cooldownUntil: new Date(Date.now() + 60_000).toISOString()
    });

    expect(serviceReadiness(strong).score).toBeGreaterThan(serviceReadiness(weak).score);
    expect(serviceReadiness(strong).grade).toBe("excellent");
    expect(serviceReadiness(weak).grade).toBe("critical");
  });

  it("summarizes operational readiness without hiding risk", () => {
    const services = [
      service({ id: "a", availability: "verified", access: "public-browser", status: "ready", visible: true }),
      service({ id: "b", availability: "degraded", access: "network-restricted", status: "idle" }),
      service({ id: "c", availability: "unavailable", access: "server-error", status: "error" })
    ];
    const summary = summarizeOperationalReadiness(services);
    expect(summary.total).toBe(3);
    expect(summary.verified).toBe(1);
    expect(summary.risky).toBe(2);
    expect(summary.runtimeErrors).toBe(1);
  });

  it("ranks services deterministically and emits actionable recommendations", () => {
    const services = [
      service({ id: "best", displayName: "Best", availability: "verified", access: "public-browser", status: "ready" }),
      service({ id: "worst", displayName: "Worst", availability: "unavailable", access: "server-error", status: "error" })
    ];
    expect(rankServicesByReadiness(services, "worst")[0]?.service.id).toBe("worst");
    expect(operationalRecommendations(services).join(" ")).toMatch(/hata/i);
  });

  it("keeps grade boundaries stable", () => {
    expect(readinessGrade(85)).toBe("excellent");
    expect(readinessGrade(65)).toBe("good");
    expect(readinessGrade(40)).toBe("attention");
    expect(readinessGrade(39)).toBe("critical");
  });
});
