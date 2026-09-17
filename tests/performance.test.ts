import { describe, expect, it } from "vitest";
import { detectPerformanceProfile, profileToSceneQuality } from "../src/lib/performance";

describe("performance profile", () => {
  it("düşük kaynakta eco seçer", () => {
    expect(detectPerformanceProfile({ hardwareConcurrency: 2, deviceMemory: 2, reducedMotion: false, mobile: false })).toBe("eco");
  });

  it("güçlü masaüstünde high seçer", () => {
    expect(detectPerformanceProfile({ hardwareConcurrency: 12, deviceMemory: 16, reducedMotion: false, mobile: false })).toBe("high");
  });

  it("profil ArcGIS kalite seviyesine çevrilir", () => {
    expect(profileToSceneQuality("balanced")).toBe("medium");
  });
});
