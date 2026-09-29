import { describe, expect, it } from "vitest";
import {
  applyTucbsClientHealthToService,
  clientHealthProfilesFromVerification,
  isTucbsClientHealthFresh
} from "../src/lib/tucbsClientHealth";
import type { ServiceDefinition } from "../src/types";

const NOW = Date.parse("2026-09-29T08:00:00.000Z");

function tucbsService(overrides: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id: "dogalgaz-hatti-wms",
    kind: "WMS",
    displayName: "DOĞALGAZ HATTI",
    organization: "EPDK",
    owner: "EPDK",
    url: "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/SAFE/wms/demo/test",
    tokenUrl: "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/SAFE/wms/demo/test",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "network-restricted",
    failureCount: 0,
    ustKurumAdi: "EPDK",
    metaveriSahibiKurumAdi: "EPDK",
    cografiVeriKatmanAdi: "DOĞALGAZ HATTI",
    servisTuruAdi: "WMS",
    ...overrides
  };
}

describe("TUCBS client health", () => {
  it("builds URL-free profiles from browser verification", () => {
    const profiles = clientHealthProfilesFromVerification({
      results: [{
        key: "tucbs.dogalgaz-hatti.wms",
        ok: true,
        latencyMs: 184,
        capabilityVersion: "1.3.0"
      }]
    }, NOW);

    expect(profiles["tucbs.dogalgaz-hatti.wms"]).toEqual({
      state: "verified",
      checkedAt: "2026-09-29T08:00:00.000Z",
      latencyMs: 184,
      failureCode: undefined,
      retryable: undefined,
      capabilityVersion: "1.3.0",
      compatibilityFallback: undefined
    });
    expect(JSON.stringify(profiles)).not.toContain("https://");
    expect(JSON.stringify(profiles)).not.toContain("geoservice");
  });

  it("overlays public-runner unknown with approved-client verification", () => {
    const service = tucbsService();
    const enriched = applyTucbsClientHealthToService(service, {
      "tucbs.dogalgaz-hatti.wms": {
        state: "verified",
        checkedAt: new Date(NOW - 60_000).toISOString(),
        latencyMs: 225
      }
    }, NOW);

    expect(enriched.availability).toBe("verified");
    expect(enriched.access).toBe("public-browser");
    expect(enriched.browserCompatible).toBe(true);
    expect(enriched.verificationStale).toBe(false);
    expect(enriched.verificationLatencyMs).toBe(225);
    expect(enriched.verificationReason).toContain("Onaylı dış IP");
    expect(enriched.tucbsEndpointKey).toBe("tucbs.dogalgaz-hatti.wms");
  });

  it("keeps stale failures retryable instead of turning them into a permanent circuit breaker", () => {
    const service = tucbsService();
    const old = new Date(NOW - 31 * 60_000).toISOString();
    const enriched = applyTucbsClientHealthToService(service, {
      "tucbs.dogalgaz-hatti.wms": {
        state: "failed",
        checkedAt: old,
        failureCode: "access-denied",
        retryable: false
      }
    }, NOW);

    expect(isTucbsClientHealthFresh({ state: "failed", checkedAt: old }, NOW)).toBe(false);
    expect(enriched.availability).toBe("degraded");
    expect(enriched.verificationStale).toBe(true);
  });

  it("marks fresh access-denied failures unavailable and network-restricted", () => {
    const enriched = applyTucbsClientHealthToService(tucbsService(), {
      "tucbs.dogalgaz-hatti.wms": {
        state: "failed",
        checkedAt: new Date(NOW - 10_000).toISOString(),
        failureCode: "access-denied",
        retryable: false,
        latencyMs: 91
      }
    }, NOW);

    expect(enriched.availability).toBe("unavailable");
    expect(enriched.access).toBe("network-restricted");
    expect(enriched.verificationReason).toContain("mevcut dış IP");
  });

  it("maps retryable browser-network failures to degraded browser-blocked state", () => {
    const enriched = applyTucbsClientHealthToService(tucbsService(), {
      "tucbs.dogalgaz-hatti.wms": {
        state: "failed",
        checkedAt: new Date(NOW - 10_000).toISOString(),
        failureCode: "browser-network",
        retryable: true
      }
    }, NOW);

    expect(enriched.availability).toBe("degraded");
    expect(enriched.access).toBe("browser-blocked");
    expect(enriched.browserCompatible).toBe(false);
  });

  it("never applies client health to an unconfigured runtime sentinel", () => {
    const sentinel = tucbsService({
      url: "https://ucbp-api.tucbs.gov.tr/__runtime__/tucbs.dogalgaz-hatti.wms",
      tokenUrl: "https://ucbp-api.tucbs.gov.tr/__runtime__/tucbs.dogalgaz-hatti.wms"
    });
    const enriched = applyTucbsClientHealthToService(sentinel, {
      "tucbs.dogalgaz-hatti.wms": {
        state: "verified",
        checkedAt: new Date(NOW - 10_000).toISOString()
      }
    }, NOW);

    expect(enriched).toBe(sentinel);
    expect(enriched.availability).toBe("unknown");
  });
});
