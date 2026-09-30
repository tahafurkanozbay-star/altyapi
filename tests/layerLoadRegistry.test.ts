import { describe, expect, it, vi } from "vitest";
import {
  cancelAllTrackedLayerLoads,
  cancelTrackedLayerLoad,
  releaseTrackedLayerLoad,
  trackLayerLoad,
  trackedLayerLoadCount
} from "../src/gis/layerLoadRegistry";

function layer() {
  return { cancelLoad: vi.fn() };
}

describe("layerLoadRegistry", () => {
  it("cancels and releases the tracked ArcGIS load", () => {
    const current = layer();
    trackLayerLoad("svc-a", current);

    expect(trackedLayerLoadCount()).toBe(1);
    expect(cancelTrackedLayerLoad("svc-a")).toBe(true);
    expect(current.cancelLoad).toHaveBeenCalledTimes(1);
    expect(trackedLayerLoadCount()).toBe(0);
  });

  it("does not cancel a successfully released load", () => {
    const current = layer();
    trackLayerLoad("svc-b", current);
    releaseTrackedLayerLoad("svc-b", current);

    expect(cancelTrackedLayerLoad("svc-b")).toBe(false);
    expect(current.cancelLoad).not.toHaveBeenCalled();
  });

  it("keeps the newest layer when an older retry releases late", () => {
    const oldLayer = layer();
    const freshLayer = layer();
    trackLayerLoad("svc-c", oldLayer);
    trackLayerLoad("svc-c", freshLayer);

    releaseTrackedLayerLoad("svc-c", oldLayer);
    expect(cancelTrackedLayerLoad("svc-c")).toBe(true);
    expect(oldLayer.cancelLoad).not.toHaveBeenCalled();
    expect(freshLayer.cancelLoad).toHaveBeenCalledTimes(1);
  });

  it("cancels all tracked loads during runtime disposal", () => {
    const first = layer();
    const second = layer();
    trackLayerLoad("svc-d", first);
    trackLayerLoad("svc-e", second);

    expect(cancelAllTrackedLayerLoads()).toBe(2);
    expect(first.cancelLoad).toHaveBeenCalledTimes(1);
    expect(second.cancelLoad).toHaveBeenCalledTimes(1);
    expect(trackedLayerLoadCount()).toBe(0);
  });
});
