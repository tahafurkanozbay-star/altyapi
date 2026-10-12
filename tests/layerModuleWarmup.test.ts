import { describe, expect, it, vi } from "vitest";
import { createLayerModuleWarmup } from "../src/gis/layerModuleWarmup";

describe("intent module warmup", () => {
  it("deduplicates rapid hover/focus intent without constructing remote layers", async () => {
    const loader = vi.fn(async () => ({}));
    const loaders = { MapServer: loader, FeatureServer: loader, SceneServer: loader, WMS: loader, WFS: loader };
    const queued: Array<() => Promise<unknown>> = [];
    const warm = createLayerModuleWarmup(loaders, () => true, (task) => {
      queued.push(task);
      return Promise.resolve();
    });
    warm("MapServer"); warm("MapServer"); warm("MapServer");
    expect(loader).not.toHaveBeenCalled();
    await queued[0]!();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith();
  });
  it("skips data-saving or overloaded sessions and rechecks admission after yielding", async () => {
    const loader = vi.fn(async () => ({}));
    let allowed = false;
    let run: (() => Promise<unknown>) | undefined;
    const warm = createLayerModuleWarmup({ MapServer: loader, FeatureServer: loader, SceneServer: loader, WMS: loader, WFS: loader }, () => allowed, (task) => { run = task; return Promise.resolve(); });
    warm("WMS"); expect(run).toBeUndefined();
    allowed = true; warm("WMS"); allowed = false;
    await run?.();
    expect(loader).not.toHaveBeenCalled();
  });
});
