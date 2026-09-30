import { describe, expect, it } from "vitest";
import { networkConcurrencyCap, type NetworkQualitySnapshot } from "../src/platform/networkQuality";

function quality(overrides: Partial<NetworkQualitySnapshot> = {}): NetworkQualitySnapshot {
  return {
    online: true,
    saveData: false,
    effectiveType: "4g",
    downlinkMbps: 10,
    rttMs: 80,
    hidden: false,
    ...overrides
  };
}

describe("networkConcurrencyCap", () => {
  it("preserves the hardware/profile budget on a healthy connection", () => {
    expect(networkConcurrencyCap(3, quality())).toBe(3);
    expect(networkConcurrencyCap(2, quality())).toBe(2);
  });

  it("serializes new loads when the browser signals strong network pressure", () => {
    expect(networkConcurrencyCap(3, quality({ saveData: true }))).toBe(1);
    expect(networkConcurrencyCap(3, quality({ hidden: true }))).toBe(1);
    expect(networkConcurrencyCap(3, quality({ effectiveType: "2g" }))).toBe(1);
    expect(networkConcurrencyCap(3, quality({ rttMs: 1_200 }))).toBe(1);
    expect(networkConcurrencyCap(3, quality({ downlinkMbps: 0.7 }))).toBe(1);
  });

  it("pauses new remote admissions while the browser is explicitly offline", () => {
    expect(networkConcurrencyCap(3, quality({ online: false }))).toBe(0);
    expect(networkConcurrencyCap(1, quality({ online: false }))).toBe(0);
  });

  it("uses a middle cap for moderately constrained links", () => {
    expect(networkConcurrencyCap(3, quality({ effectiveType: "3g" }))).toBe(2);
    expect(networkConcurrencyCap(3, quality({ rttMs: 650 }))).toBe(2);
    expect(networkConcurrencyCap(3, quality({ downlinkMbps: 1.5 }))).toBe(2);
  });

  it("never exceeds the profile budget and keeps the online safe floor", () => {
    expect(networkConcurrencyCap(1, quality({ saveData: true }))).toBe(1);
    expect(networkConcurrencyCap(0, quality())).toBe(1);
  });
});
