import { describe, expect, it } from "vitest";
import {
  renderObservabilitySummary,
  summarizeHealthCoverage,
  summarizeScaleCoverage
} from "../scripts/observability-coverage.ts";

describe("service observability coverage", () => {
  it("excludes client-IP-restricted TUCBS entries from public-runner health coverage", () => {
    const coverage = summarizeHealthCoverage([
      { availability: "verified", access: "public-browser" },
      { availability: "unavailable", access: "server-error" },
      { availability: "unknown", access: "network-restricted" },
      { availability: "unknown", access: "network-restricted" }
    ]);

    expect(coverage).toEqual({
      total: 4,
      probeableTotal: 2,
      clientIpRequired: 2,
      verified: 1,
      degraded: 0,
      unavailable: 1,
      unknownProbeable: 0
    });
  });

  it("uses only public-runner-probeable services as the scale reachability denominator", () => {
    const coverage = summarizeScaleCoverage([
      { reachable: true, source: "arcgis-metadata", explicitScaleLimit: true },
      { reachable: false, source: "wms-capabilities", explicitScaleLimit: false },
      { reachable: false, source: "client-ip-required", explicitScaleLimit: false },
      { reachable: false, source: "client-ip-required", explicitScaleLimit: false }
    ]);

    expect(coverage).toEqual({
      total: 4,
      probeableTotal: 2,
      clientIpRequired: 2,
      reachableProbeable: 1,
      unreachableProbeable: 1,
      explicitScaleLimits: 1
    });
  });

  it("states the client-IP boundary explicitly in the engineering summary", () => {
    const summary = renderObservabilitySummary({
      generatedAt: "2026-09-28T10:00:00.000Z",
      auditedAt: "2026-09-28T10:01:00.000Z",
      health: [
        { availability: "verified", access: "public-browser" },
        { availability: "unknown", access: "network-restricted" }
      ],
      scale: [
        { reachable: true, source: "arcgis-metadata", explicitScaleLimit: false },
        { reachable: false, source: "client-ip-required", explicitScaleLimit: false }
      ]
    });

    expect(summary).toContain("public-runner probeable health**: 1/2");
    expect(summary).toContain("scale metadata reachable (probeable)**: 1/1");
    expect(summary).toContain("TUCBS client-IP-required**: 1");
    expect(summary).toContain("yetkili kullanıcı IP'sinden tarayıcı içinde doğrulanır");
    expect(summary).not.toContain("scale metadata reachable (probeable)**: 1/2");
  });
});
