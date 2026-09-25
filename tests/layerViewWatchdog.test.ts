import { describe, expect, it } from "vitest";
import {
  layerViewRecoveryScale,
  layerViewScaleIntersection,
  shouldRecycleLayerView
} from "../src/gis/layerViewWatchdog";

describe("LayerView provider-scale watchdog", () => {
  it("builds the strict intersection from visible constrained layers only", () => {
    const state = layerViewScaleIntersection([
      {
        layer: { id: "svc-water", visible: true, minScale: 400_000 },
        visible: true,
        visibleAtCurrentScale: false
      },
      {
        layer: { id: "svc-plan", visible: true, minScale: 2_311_162, maxScale: 1_128 },
        visible: true,
        visibleAtCurrentScale: true
      },
      {
        layer: { id: "svc-hidden", visible: false, minScale: 50_000 },
        visible: true,
        visibleAtCurrentScale: false
      }
    ]);

    expect(state.minScale).toBe(400_000);
    expect(state.maxScale).toBe(1_128);
    expect(state.constrainedLayerIds).toEqual(["svc-water", "svc-plan"]);
    expect(state.violatingLayerIds).toEqual(["svc-water"]);
    expect(state.conflict).toBe(false);
  });

  it("moves safely inside a far zoom-out boundary", () => {
    const target = layerViewRecoveryScale(480_000, {
      minScale: 400_000,
      maxScale: undefined,
      violatingLayerIds: ["svc-water"],
      conflict: false
    });
    expect(target).toBe(384_000);
  });

  it("moves safely inside a close zoom-in boundary", () => {
    const target = layerViewRecoveryScale(900, {
      minScale: 2_311_162,
      maxScale: 1_128,
      violatingLayerIds: ["svc-plan"],
      conflict: false
    });
    expect(target).toBe(1_173);
  });

  it("uses a geometric interior fallback when ArcGIS still reports invisible inside the numeric range", () => {
    const target = layerViewRecoveryScale(300_000, {
      minScale: 400_000,
      maxScale: 100_000,
      violatingLayerIds: ["svc-example"],
      conflict: false
    });
    expect(target).toBe(200_000);
  });

  it("does not fight impossible intersections", () => {
    const target = layerViewRecoveryScale(250_000, {
      minScale: 100_000,
      maxScale: 200_000,
      violatingLayerIds: ["svc-a", "svc-b"],
      conflict: true
    });
    expect(target).toBeUndefined();
  });

  it("never retries permanent authentication or configuration failures", () => {
    expect(shouldRecycleLayerView(new Error("HTTP 403 Forbidden"))).toBe(false);
    expect(shouldRecycleLayerView(new Error("Invalid token"))).toBe(false);
    expect(shouldRecycleLayerView(new Error("Unsupported spatial reference"))).toBe(false);
    expect(shouldRecycleLayerView(new Error("Temporary renderer initialization failed"))).toBe(true);
  });
});
