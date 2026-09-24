import { describe, expect, it } from "vitest";
import { clampScaleToActiveRange, deriveActiveScaleLockRange } from "../src/gis/activeScaleLock";

describe("activeScaleLock", () => {
  it("intersects visible operational layer scale ranges", () => {
    const range = deriveActiveScaleLockRange([
      { id: "svc-water", visible: true, minScale: 400000, maxScale: 0 },
      { id: "svc-plan", visible: true, minScale: 2311162, maxScale: 1128 },
      { id: "basemap", visible: true, minScale: 100000 }
    ]);

    expect(range.compatible).toBe(true);
    expect(range.minScale).toBe(400000);
    expect(range.maxScale).toBe(1128);
    expect(range.layerIds).toEqual(["svc-water", "svc-plan"]);
  });

  it("ignores hidden and unrestricted operational layers", () => {
    const range = deriveActiveScaleLockRange([
      { id: "svc-hidden", visible: false, minScale: 100000 },
      { id: "svc-unbounded", visible: true, minScale: 0, maxScale: 0 }
    ]);
    expect(range.minScale).toBeUndefined();
    expect(range.maxScale).toBeUndefined();
    expect(range.layerIds).toEqual([]);
  });

  it("clamps zoom-out and zoom-in attempts to the verified range", () => {
    const range = { minScale: 400000, maxScale: 1128, layerIds: ["svc-a"], compatible: true };
    expect(clampScaleToActiveRange(800000, range)).toBe(400000);
    expect(clampScaleToActiveRange(500, range)).toBe(1128);
    expect(clampScaleToActiveRange(250000, range)).toBe(250000);
  });

  it("detects incompatible active scale ranges", () => {
    const range = deriveActiveScaleLockRange([
      { id: "svc-a", visible: true, minScale: 1000 },
      { id: "svc-b", visible: true, maxScale: 2000 }
    ]);
    expect(range.compatible).toBe(false);
    expect(clampScaleToActiveRange(1500, range)).toBe(1500);
  });
});
