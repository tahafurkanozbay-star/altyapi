import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  extentOverlapState,
  layerCoverageTarget,
  projectExtentForComparison,
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

  it("compares WGS84 provider extents with Web Mercator Scene extents without guessing", () => {
    const ankaraGeographic = { xmin: 32.4, ymin: 39.6, xmax: 33.3, ymax: 40.2 };
    const projected = projectExtentForComparison(ankaraGeographic, 4326, 3857);
    expect(projected).toBeDefined();

    const view = {
      xmin: projected!.xmin - 2_000,
      ymin: projected!.ymin - 2_000,
      xmax: projected!.xmax + 2_000,
      ymax: projected!.ymax + 2_000,
      spatialReference: sr3857
    };
    const layer = { ...ankaraGeographic, spatialReference: sr4326 };

    expect(extentOverlapState(view, layer)).toBe("intersects");
    expect(shouldAutoFocusLayerCoverage(view, layer)).toBe(false);
  });

  it("detects disjoint WGS84 and Web Mercator coverage in either projection direction", () => {
    const ankara = { xmin: 32.4, ymin: 39.6, xmax: 33.3, ymax: 40.2, spatialReference: sr4326 };
    const equatorView = { xmin: -100_000, ymin: -100_000, xmax: 100_000, ymax: 100_000, spatialReference: sr3857 };
    expect(extentOverlapState(equatorView, ankara)).toBe("disjoint");

    const projectedAnkara = projectExtentForComparison({ xmin: 32.4, ymin: 39.6, xmax: 33.3, ymax: 40.2 }, 4326, 3857)!;
    const geographicView = { xmin: -1, ymin: -1, xmax: 1, ymax: 1, spatialReference: sr4326 };
    const webMercatorLayer = { ...projectedAnkara, spatialReference: sr102100 };
    expect(extentOverlapState(geographicView, webMercatorLayer)).toBe("disjoint");
  });

  it("round-trips Ankara extent through Web Mercator with tight numeric tolerance", () => {
    const geographic = { xmin: 32.5, ymin: 39.7, xmax: 33.2, ymax: 40.1 };
    const mercator = projectExtentForComparison(geographic, 4326, 3857);
    expect(mercator).toBeDefined();
    const roundTrip = projectExtentForComparison(mercator!, 3857, 4326);
    expect(roundTrip).toBeDefined();
    expect(roundTrip!.xmin).toBeCloseTo(geographic.xmin, 6);
    expect(roundTrip!.ymin).toBeCloseTo(geographic.ymin, 6);
    expect(roundTrip!.xmax).toBeCloseTo(geographic.xmax, 6);
    expect(roundTrip!.ymax).toBeCloseTo(geographic.ymax, 6);
  });

  it("never guesses across unsupported or incomplete spatial references", () => {
    const view = { xmin: 0, ymin: 0, xmax: 100, ymax: 100, spatialReference: sr3857 };
    const utm = { xmin: 450_000, ymin: 4_350_000, xmax: 550_000, ymax: 4_450_000, spatialReference: { wkid: 32636 } };
    const missingSr = { xmin: 200, ymin: 200, xmax: 300, ymax: 300 };

    expect(extentOverlapState(view, utm)).toBe("unknown");
    expect(extentOverlapState(view, missingSr)).toBe("unknown");
    expect(shouldAutoFocusLayerCoverage(view, utm)).toBe(false);
    expect(shouldAutoFocusLayerCoverage(view, missingSr)).toBe(false);
  });

  it("rejects malformed or impossible provider extents instead of navigating to them", () => {
    const view = { xmin: 0, ymin: 0, xmax: 100, ymax: 100, spatialReference: sr3857 };
    const zeroWidth = { xmin: 10, ymin: 10, xmax: 10, ymax: 50, spatialReference: sr3857 };
    const nonFinite = { xmin: Number.NaN, ymin: 10, xmax: 50, ymax: 50, spatialReference: sr3857 };
    const invalidGeographic = { xmin: 190, ymin: 39, xmax: 195, ymax: 40, spatialReference: sr4326 };

    expect(extentOverlapState(view, zeroWidth)).toBe("unknown");
    expect(extentOverlapState(view, nonFinite)).toBe("unknown");
    expect(extentOverlapState(view, invalidGeographic)).toBe("unknown");
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
    expect(watchdog).toContain('layer.watch("visible"');
    expect(watchdog).toContain("projectExtentForComparison");
    expect(watchdog).toContain("shouldAutoFocusLayerCoverage(scene.extent, fullExtent)");
    expect(watchdog).toContain("ACTIVATION_NAVIGATION_DEBOUNCE_MS");
  });
});
