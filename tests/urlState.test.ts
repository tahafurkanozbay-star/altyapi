import { describe, expect, it } from "vitest";
import { decodeShareState, encodeShareState } from "../src/lib/urlState";

describe("urlState", () => {
  it("kamera ve katman durumunu URL'ye kayıpsız taşır", () => {
    const state = {
      camera: { longitude: 32.8542, latitude: 39.9208, z: 5200, heading: 2, tilt: 58 },
      layerIds: ["a", "b"],
      basemap: "hybrid"
    };
    const decoded = decodeShareState(encodeShareState(state));
    expect(decoded?.camera.latitude).toBeCloseTo(39.9208, 5);
    expect(decoded?.layerIds).toEqual(["a", "b"]);
    expect(decoded?.basemap).toBe("hybrid");
  });

  it("geçersiz koordinatı reddeder", () => {
    const params = new URLSearchParams("lon=32&lat=190&z=5000&heading=0&tilt=45");
    expect(decodeShareState(params)).toBeUndefined();
  });
});
