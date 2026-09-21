import { describe, expect, it } from "vitest";
import { buildStabilizationPlan } from "../src/lib/stabilization";
import type { ServiceDefinition } from "../src/types";

function service(id: string, overrides: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id,
    kind: "FeatureServer",
    displayName: id,
    organization: "ABB",
    owner: "ABB",
    url: `https://example.com/${id}/FeatureServer/0`,
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: id,
    servisTuruAdi: "FeatureServer",
    tokenUrl: `https://example.com/${id}/FeatureServer/0`,
    ...overrides
  };
}

describe("workspace stabilization", () => {
  it("hides visible risky layers and keeps stable verified layers", () => {
    const plan = buildStabilizationPlan([
      service("safe", { visible: true, availability: "verified", access: "public-browser", status: "ready" }),
      service("risky", { visible: true, availability: "unavailable", access: "server-error", status: "error" })
    ], { now: Date.parse("2026-09-21T10:00:00.000Z") });

    expect(plan.hideIds).toEqual(["risky"]);
    expect(plan.activateIds).toEqual([]);
    expect(plan.alreadyStable).toEqual(["safe"]);
  });

  it("activates at most two best verified services when no stable layer is active", () => {
    const plan = buildStabilizationPlan([
      service("map", { kind: "MapServer", servisTuruAdi: "MapServer", availability: "verified", access: "public-browser" }),
      service("scene", { kind: "SceneServer", servisTuruAdi: "SceneServer", availability: "verified", access: "public-browser" }),
      service("favorite-feature", { favorite: true, availability: "verified", access: "public-browser" }),
      service("bad", { visible: true, availability: "degraded", access: "network-restricted" })
    ], { maxActivations: 2, now: Date.parse("2026-09-21T10:00:00.000Z") });

    expect(plan.hideIds).toEqual(["bad"]);
    expect(plan.activateIds).toEqual(["favorite-feature", "scene"]);
    expect(plan.activateIds).toHaveLength(2);
  });

  it("does not activate cooling-down services", () => {
    const now = Date.parse("2026-09-21T10:00:00.000Z");
    const plan = buildStabilizationPlan([
      service("cooling", {
        availability: "verified",
        access: "public-browser",
        cooldownUntil: new Date(now + 60_000).toISOString()
      })
    ], { now });
    expect(plan.activateIds).toEqual([]);
  });
});
