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

  it("geçersiz kamera açılarını reddeder", () => {
    expect(decodeShareState(new URLSearchParams("lon=32&lat=39&z=5000&heading=999&tilt=45"))).toBeUndefined();
    expect(decodeShareState(new URLSearchParams("lon=32&lat=39&z=5000&heading=0&tilt=-5"))).toBeUndefined();
  });

  it("katman kimliklerini tekilleştirir ve güvenli karakterlerle sınırlar", () => {
    const params = new URLSearchParams("lon=32&lat=39&z=5000&heading=0&tilt=45&layers=a,a,b,%3Cscript%3E");
    expect(decodeShareState(params)?.layerIds).toEqual(["a", "b"]);
  });

  it("geçersiz altlık değerini paylaşım durumundan çıkarır", () => {
    const params = new URLSearchParams("lon=32&lat=39&z=5000&heading=0&tilt=45&basemap=%3Cscript%3E");
    expect(decodeShareState(params)?.basemap).toBeUndefined();
  });

  it("captures opacity in draw order and preserves fully transparent layers", () => {
    const state = { camera: { longitude: 32, latitude: 39, z: 5200, heading: 2, tilt: 58 }, layerIds: ["b", "a"], layerOpacity: { a: 0, b: 0.35, hidden: 0.7 } };
    const encoded = encodeShareState(state);
    expect(encoded.get("opacity")).toBe("0.35,0");
    expect(decodeShareState(encoded)?.layerOpacity).toEqual({ b: 0.35, a: 0 });
  });

  it("keeps older links compatible and ignores mismatched or invalid opacities", () => {
    const base = "lon=32&lat=39&z=5200&heading=2&tilt=58&layers=a,b";
    for (const opacity of [undefined, "0.4", "0.4,", "NaN,0.3", "Infinity,0.2", "-1,0.2", "0.3,2", "0.3,0.4,0.5"]) {
      expect(decodeShareState(new URLSearchParams(base + (opacity === undefined ? "" : `&opacity=${opacity}`)))?.layerOpacity).toBeUndefined();
    }
  });

  it("normalizes the encoder's opacity values without exposing uncaptured IDs", () => {
    const params = encodeShareState({ camera: { longitude: 32, latitude: 39, z: 5200, heading: 2, tilt: 58 }, layerIds: ["a", "a", "b", "c"], layerOpacity: { a: -1, b: 4, c: NaN } });
    expect(params.get("opacity")).toBe("0,1,1");
    expect(decodeShareState(params)?.layerOpacity).toEqual({ a: 0, b: 1, c: 1 });
  });

  it("rejects empty camera values and bounds oversized opacity input", () => {
    expect(decodeShareState(new URLSearchParams("lon=&lat=39&z=5200&heading=2&tilt=58"))).toBeUndefined();
    expect(decodeShareState(new URLSearchParams("lon=32&lat=39&z=5200&heading=2&tilt=58&layers=a&opacity=" + "0".repeat(3201)))?.layerOpacity).toBeUndefined();
  });
});
