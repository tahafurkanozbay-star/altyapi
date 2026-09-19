import { describe, expect, it } from "vitest";
import {
  SERVICE_HEALTH_MAX_AGE_MS,
  applyServiceHealthSnapshot,
  failurePatch,
  isServiceCoolingDown,
  isServiceHealthSnapshotFresh,
  parseServiceHealthSnapshot,
  shouldAutoLoadService,
  successPatch
} from "../src/lib/serviceHealth";
import type { ServiceDefinition, ServiceHealthSnapshot } from "../src/types";

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

function snapshot(generatedAt: string): ServiceHealthSnapshot {
  return {
    schemaVersion: 1,
    generatedAt,
    source: "test",
    services: [{
      index: 0,
      name: "Katman A",
      kind: "FeatureServer",
      availability: "verified",
      access: "public-browser",
      browserCompatible: true,
      reason: "test"
    }]
  };
}

describe("serviceHealth", () => {
  it("parses and applies matching verification entries", () => {
    const parsed = parseServiceHealthSnapshot(snapshot("2026-09-19T18:00:00.000Z"));
    const [enriched] = applyServiceHealthSnapshot([service()], parsed, Date.parse("2026-09-19T19:00:00.000Z"));
    expect(enriched?.availability).toBe("verified");
    expect(enriched?.access).toBe("public-browser");
    expect(enriched?.verificationStale).toBe(false);
  });

  it("marks old snapshots stale and stale negatives do not block startup", () => {
    const staleSnapshot: ServiceHealthSnapshot = {
      ...snapshot("2026-09-10T18:00:00.000Z"),
      services: [{
        index: 0,
        name: "Katman A",
        kind: "FeatureServer",
        availability: "unavailable",
        access: "server-error",
        browserCompatible: false
      }]
    };
    const now = Date.parse("2026-09-19T19:00:00.000Z");
    const [enriched] = applyServiceHealthSnapshot([service()], staleSnapshot, now);
    expect(enriched?.verificationStale).toBe(true);
    expect(enriched && shouldAutoLoadService(enriched, now)).toBe(true);
  });

  it("implements exponential cooldown after repeated failures", () => {
    const now = Date.parse("2026-09-19T19:00:00.000Z");
    const first = { ...service(), ...failurePatch(service(), "x", 100, now) };
    expect(first.failureCount).toBe(1);
    expect(first.cooldownUntil).toBeUndefined();

    const second = { ...first, ...failurePatch(first, "x", 120, now) };
    expect(second.failureCount).toBe(2);
    expect(isServiceCoolingDown(second, now + 10_000)).toBe(true);

    const recovered = { ...second, ...successPatch(80, now + 60_000) };
    expect(recovered.failureCount).toBe(0);
    expect(recovered.cooldownUntil).toBeUndefined();
  });

  it("enforces snapshot freshness window", () => {
    const now = Date.parse("2026-09-19T19:00:00.000Z");
    expect(isServiceHealthSnapshotFresh(snapshot(new Date(now - SERVICE_HEALTH_MAX_AGE_MS + 1000).toISOString()), now)).toBe(true);
    expect(isServiceHealthSnapshotFresh(snapshot(new Date(now - SERVICE_HEALTH_MAX_AGE_MS - 1000).toISOString()), now)).toBe(false);
  });
});
