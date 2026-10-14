import { describe, expect, it } from "vitest";
import { mapCaptureSize } from "../src/lib/mapCapture";

describe("map screenshot dimensions", () => {
  it("captures the measured map size at device resolution", () => {
    expect(mapCaptureSize(800, 600, 2)).toEqual({ width: 1600, height: 1200 });
  });
  it("bounds a landscape export without changing its aspect ratio", () => {
    expect(mapCaptureSize(1440, 900, 3)).toEqual({ width: 2400, height: 1500 });
  });
  it("also bounds portrait height on a high density phone", () => {
    expect(mapCaptureSize(390, 844, 3)).toEqual({ width: 1109, height: 2400 });
  });
  it("avoids oversized surfaces on ultra wide maps", () => {
    expect(mapCaptureSize(6000, 1500, 1)).toEqual({ width: 2400, height: 600 });
  });
  it("normalizes invalid dimensions and pixel ratios", () => {
    expect(mapCaptureSize(NaN, Infinity, NaN)).toEqual({ width: 1, height: 1 });
    expect(mapCaptureSize(800, 600, 0)).toEqual({ width: 800, height: 600 });
  });
});
