import { describe, expect, it } from "vitest";
import {
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
    id: "svc-1",
    kind: "FeatureServer",
    displayName: "SINIRLAR",
    organization: "ABB",
    owner: "ABB",
    url: "https://example.test/FeatureServer/1",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: "SINIRLAR",
    servisTuruAdi: "FeatureServer",
    tokenUrl: "https://example.test/FeatureServer/1",
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
      name: "SINIRLAR",
      kind: "FeatureServer",
      availability: "verified",
      access: "public-browser",
      browserCompatible: true,
      reason: "test ok"
    }]
  };
}

describe("serviceHealth", () => {
  it("parses sanitized verification snapshots", () => {
    const parsed = parseServiceHealthSnapshot(snapshot("2026-09-19T12:00:00.000Z"));
    expect(parsed.services).toHaveLength(1);
    expect(parsed.services[0]?.availability).toBe("verified");
  });

  it("applies verification state and marks stale snapshots", () => {
    const current = Date.parse("2026-09-19T12:00:00.000Z");
    const fresh = applyServiceHealthSnapshot([service()], snapshot("2026-09-19T11:00:00.000Z"), current)[0]!;
    expect(fresh.availability).toBe("verified");
    expect(fresh.verificationStale).toBe(false);

    const stale = applyServiceHealthSnapshot([service()], snapshot("2026-09-14T11:00:00.000Z"), current)[0]!;
    expect(stale.verificationStale).toBe(true);
    expect(shouldAutoLoadService(stale, current)).toBe(true);
  });

  it("uses exponential cooldown after repeated failures", () => {
    const now = Date.parse("2026-09-19T12:00:00.000Z");
    const first = { ...service(), ...failurePatch(service(), "timeout", 1200, now) };
    expect(first.failureCount).toBe(1);
    expect(first.cooldownUntil).toBeUndefined();

    const secondPatch = failurePatch(first, "timeout", 1300, now);
    const second = { ...first, ...secondPatch };
    expect(second.failureCount).toBe(2);
    expect(isServiceCoolingDown(second, now + 1)).toBe(true);
    expect(shouldAutoLoadService(second, now + 1)).toBe(false);
  });

  it("resets circuit state after success", () => {
    const recovered = { ...service({ failureCount: 3, cooldownUntil: "2026-09-19T13:00:00.000Z" }), ...successPatch(220, Date.parse("2026-09-19T12:00:00.000Z")) };
    expect(recovered.failureCount).toBe(0);
    expect(recovered.cooldownUntil).toBeUndefined();
    expect(recovered.status).toBe("ready");
  });

  it("rejects unsupported snapshot shape and detects freshness", () => {
    expect(() => parseServiceHealthSnapshot({ schemaVersion: 2, services: [] })).toThrow(/desteklenmeyen/i);
    expect(isServiceHealthSnapshotFresh(snapshot("2026-09-19T11:00:00.000Z"), Date.parse("2026-09-19T12:00:00.000Z"))).toBe(true);
    expect(isServiceHealthSnapshotFresh(snapshot("2026-09-10T11:00:00.000Z"), Date.parse("2026-09-19T12:00:00.000Z"))).toBe(false);
  });
});
