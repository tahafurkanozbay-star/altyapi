import { describe, expect, it } from "vitest";
import { citizenSupportReportToJson, createCitizenSupportReport } from "../src/lib/supportReport";
import type { RuntimeIncident, ServiceDefinition } from "../src/types";

function service(overrides: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id: "svc-a",
    kind: "FeatureServer",
    displayName: "Sınırlar",
    organization: "ABB",
    owner: "ABB",
    url: "https://secret.example/FeatureServer/0?token=do-not-export",
    status: "ready",
    visible: true,
    opacity: 1,
    favorite: false,
    availability: "verified",
    access: "public-browser",
    failureCount: 0,
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: "Sınırlar",
    servisTuruAdi: "FeatureServer",
    tokenUrl: "https://secret.example/FeatureServer/0?token=do-not-export",
    ...overrides
  };
}

describe("citizen support report", () => {
  it("exports service state without endpoint or credential fields", () => {
    const incidents: RuntimeIncident[] = [{
      id: "i-1",
      occurredAt: "2026-10-02T04:00:00.000Z",
      severity: "error",
      kind: "layer-load",
      message: "failed https://secret.example/path?token=abc",
      serviceName: "Sınırlar",
      occurrences: 3
    }];
    const report = createCitizenSupportReport([service({ latencyMs: 345 })], incidents, true, new Date("2026-10-02T04:05:00.000Z"));
    const json = citizenSupportReportToJson(report);

    expect(report.summary.total).toBe(1);
    expect(report.summary.ready).toBe(1);
    expect(report.incidents[0]?.occurrences).toBe(3);
    expect(json).not.toContain("tokenUrl");
    expect(json).not.toContain("secret.example");
    expect(json).not.toContain("do-not-export");
    expect(json).toContain('"application": "Ankara Kent Rehberi"');
  });

  it("bounds unsafe numeric fields", () => {
    const report = createCitizenSupportReport([
      service({ latencyMs: 999_999, failureCount: 5_000 })
    ], [], false);
    expect(report.services[0]?.latencyMs).toBe(120_000);
    expect(report.services[0]?.failureCount).toBe(999);
    expect(report.online).toBe(false);
  });
});
