import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  extentOverlapState,
  layerCoverageTarget,
  shouldAutoFocusLayerCoverage
} from "../src/gis/layerCoverageWatchdog";

const sr3857 = { wkid: 3857 };
const sr102100 = { wkid: 102100 };
const sr4326 = { wkid: 4326 };

describe("Layer coverage activation watchdog", () => {
  it("keeps the camera when the current view already intersects the provider extent", () => {
    const view = { xmin: 0, ymin: 0, xmax: 100, ymax: 100, spatialReference: sr3857 };
    const layer = { xmin: 60, ymin: 20, xmax: 160, ymax: 80, spatialReference: sr3857 };

    expect(extentOverlapState(view, layer)).toBe("intersects");
    expect(shouldAutoFocusLayerCoverage(view, layer)).toBe(false);
  });

  it("focuses only when compatible provider and view extents are provably disjoint", () => {
    const view = { xmin: 0, ymin: 0, xmax: 100, ymax: 100, spatialReference: sr3857 };
    const layer = { xmin: 200, ymin: 200, xmax: 300, ymax: 300, spatialReference: sr102100 };

    expect(extentOverlapState(view, layer)).toBe("disjoint");
    expect(shouldAutoFocusLayerCoverage(view, layer)).toBe(true);
  });

  it("never guesses across incompatible or incomplete spatial references", () => {
    const view = { xmin: 0, ymin: 0, xmax: 100, ymax: 100, spatialReference: sr3857 };
    const geographic = { xmin: 30, ymin: 39, xmax: 34, ymax: 41, spatialReference: sr4326 };
    const missingSr = { xmin: 200, ymin: 200, xmax: 300, ymax: 300 };

    expect(extentOverlapState(view, geographic)).toBe("unknown");
    expect(extentOverlapState(view, missingSr)).toBe("unknown");
    expect(shouldAutoFocusLayerCoverage(view, geographic)).toBe(false);
    expect(shouldAutoFocusLayerCoverage(view, missingSr)).toBe(false);
  });

  it("rejects malformed provider extents instead of navigating to them", () => {
    const view = { xmin: 0, ymin: 0, xmax: 100, ymax: 100, spatialReference: sr3857 };
    const zeroWidth = { xmin: 10, ymin: 10, xmax: 10, ymax: 50, spatialReference: sr3857 };
    const nonFinite = { xmin: Number.NaN, ymin: 10, xmax: 50, ymax: 50, spatialReference: sr3857 };

    expect(extentOverlapState(view, zeroWidth)).toBe("unknown");
    expect(extentOverlapState(view, nonFinite)).toBe("unknown");
  });

  it("adds a small framing margin when the ArcGIS extent supports expand", () => {
    const expanded = { id: "expanded" };
    const expand = vi.fn(() => expanded);
    const layer = {
      xmin: 200,
      ymin: 200,
      xmax: 300,
      ymax: 300,
      spatialReference: sr3857,
      expand
    };

    expect(layerCoverageTarget(layer)).toBe(expanded);
    expect(expand).toHaveBeenCalledWith(1.12);
  });

  it("boots the coverage watchdog alongside the render watchdog before React", async () => {
    const main = await readFile("src/main.tsx", "utf8");
    const watchdog = await readFile("src/gis/layerCoverageWatchdog.ts", "utf8");

    expect(main).toContain('import { installLayerCoverageWatchdog } from "./gis/layerCoverageWatchdog"');
    expect(main).toContain("installLayerCoverageWatchdog();");
    expect(main.indexOf("installLayerCoverageWatchdog();")).toBeLessThan(main.indexOf("createRoot(root).render"));
    expect(watchdog).toContain('document.addEventListener("arcgisViewLayerviewCreate"');
    expect(watchdog).toContain('layerView.watch("visible"');
    expect(watchdog).toContain("shouldAutoFocusLayerCoverage(scene.extent, fullExtent)");
    expect(watchdog).toContain("ACTIVATION_NAVIGATION_DEBOUNCE_MS");
  });
});
