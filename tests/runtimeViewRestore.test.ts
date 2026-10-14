import { afterEach, describe, expect, it, vi } from "vitest";
import { ArcGISRuntime } from "../src/gis/ArcGISRuntime";

vi.mock("@arcgis/core/Camera.js", () => ({ default: class { constructor(properties: unknown) { Object.assign(this, properties); } } }));

const camera = { longitude: 32.8, latitude: 39.9, z: 5200, heading: 2, tilt: 58 };
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
function runtimeState() {
  vi.stubGlobal("window", { clearTimeout, setTimeout });
  const runtime = new ArcGISRuntime("eco");
  const internals = runtime as unknown as {
    scene: unknown; activationBatchDepth: number; activationGuardDepth: number;
    flushDeferredActivationNavigation: () => Promise<void>; scheduleScaleGuard: () => void; enforceScaleGuard: () => void;
  };
  const flush = vi.spyOn(internals, "flushDeferredActivationNavigation").mockResolvedValue();
  const schedule = vi.spyOn(internals, "scheduleScaleGuard").mockImplementation(() => undefined);
  const enforce = vi.spyOn(internals, "enforceScaleGuard").mockImplementation(() => undefined);
  return { runtime, internals, flush, schedule, enforce };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("overlapping view restoration", () => {
  it("keeps camera guards until the last batch finishes when the first batch ends early", async () => {
    const { runtime, internals, flush, schedule } = runtimeState();
    const first = deferred(), second = deferred();
    const a = runtime.withLayerActivationBatch(() => first.promise);
    const b = runtime.withLayerActivationBatch(() => second.promise, { navigate: false });
    first.resolve(); await a;
    expect(internals.activationBatchDepth).toBe(1); expect(internals.activationGuardDepth).toBe(1);
    expect(flush).not.toHaveBeenCalled(); expect(schedule).not.toHaveBeenCalled();
    second.resolve(); await b;
    expect(internals.activationBatchDepth).toBe(0); expect(internals.activationGuardDepth).toBe(0);
    expect(flush).not.toHaveBeenCalled(); expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("still releases the guard once when the nested batch finishes first", async () => {
    const { runtime, internals, flush, schedule } = runtimeState();
    const first = deferred(), second = deferred();
    const a = runtime.withLayerActivationBatch(() => first.promise);
    const b = runtime.withLayerActivationBatch(() => second.promise, { navigate: false });
    second.resolve(); await b;
    expect(internals.activationGuardDepth).toBe(1); expect(schedule).not.toHaveBeenCalled();
    first.resolve(); await a;
    expect(internals.activationGuardDepth).toBe(0); expect(flush).not.toHaveBeenCalled(); expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("does not release a newer view's guard when an older batch rejects", async () => {
    const { runtime, internals, schedule } = runtimeState();
    const first = deferred(), second = deferred();
    const a = runtime.withLayerActivationBatch(async () => { await first.promise; throw new DOMException("cancel", "AbortError"); });
    const rejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
    const b = runtime.withLayerActivationBatch(() => second.promise, { navigate: false });
    first.resolve(); await rejected;
    expect(internals.activationGuardDepth).toBe(1); expect(schedule).not.toHaveBeenCalled();
    second.resolve(); await b;
    expect(internals.activationGuardDepth).toBe(0); expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("does not navigate a view whose signal was already cancelled", async () => {
    const { runtime, internals } = runtimeState();
    const goTo = vi.fn(); internals.scene = { goTo };
    const controller = new AbortController(); controller.abort();
    await expect(runtime.goTo(camera, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(goTo).not.toHaveBeenCalled();
  });

  it("does not clear a new batch that started while older automatic navigation was finishing", async () => {
    const { runtime, internals, flush, schedule } = runtimeState();
    const flight = deferred(), started = deferred(), next = deferred();
    flush.mockImplementation(() => { started.resolve(); return flight.promise; });
    const a = runtime.withLayerActivationBatch(async () => undefined);
    await started.promise;
    const b = runtime.withLayerActivationBatch(() => next.promise, { navigate: false });
    flight.resolve(); await a;
    expect(internals.activationBatchDepth).toBe(1); expect(internals.activationGuardDepth).toBe(1);
    expect(schedule).not.toHaveBeenCalled();
    next.resolve(); await b;
    expect(internals.activationBatchDepth).toBe(0); expect(internals.activationGuardDepth).toBe(0);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("passes cancellation to the SDK animation and skips post-navigation repair", async () => {
    const { runtime, internals, enforce, schedule } = runtimeState();
    const controller = new AbortController();
    const started = deferred();
    internals.scene = { goTo: (_target: unknown, options: { signal: AbortSignal }) => {
      expect(options.signal).toBe(controller.signal); started.resolve();
      return new Promise<void>((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    } };
    const navigation = runtime.goTo(camera, controller.signal);
    const rejected = expect(navigation).rejects.toMatchObject({ name: "AbortError" });
    await started.promise; controller.abort(); await rejected;
    expect(enforce).not.toHaveBeenCalled(); expect(schedule).not.toHaveBeenCalled();
  });

  it("ignores a navigation finishing after the scene was replaced", async () => {
    const { runtime, internals, enforce, schedule } = runtimeState();
    const started = deferred(), finished = deferred();
    internals.scene = { goTo: () => { started.resolve(); return finished.promise; } };
    const navigation = runtime.goTo(camera); await started.promise;
    internals.scene = {}; finished.resolve(); await navigation;
    expect(enforce).not.toHaveBeenCalled(); expect(schedule).not.toHaveBeenCalled();
  });
});
