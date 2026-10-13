import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcGISRuntime } from "../src/gis/ArcGISRuntime";
import type { ServiceDefinition } from "../src/types";

const factory = vi.hoisted(() => vi.fn());
vi.mock("../src/gis/layerFactory", () => ({ createLayer: factory, finalizeLoadedLayer: vi.fn() }));
const service = { id: "public", kind: "FeatureServer", displayName: "Kayıtlar" } as ServiceDefinition;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function mockLayer() {
  return {
    id: "svc-public", fields: [{ name: "id", alias: "Kimlik", type: "oid" }], objectIdField: "id",
    load: vi.fn(async () => undefined), createQuery: vi.fn(() => ({})),
    queryFeatures: vi.fn(async (_query: unknown, _options: { signal: AbortSignal }) => ({ features: [{ attributes: { id: 1 } }] })),
    queryFeatureCount: vi.fn(async (_query: unknown, _options: { signal: AbortSignal }) => 201),
    cancelLoad: vi.fn(), destroy: vi.fn()
  };
}

describe("attribute query lifecycle", () => {
  let runtime: ArcGISRuntime;
  let layer: ReturnType<typeof mockLayer>;
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  beforeEach(() => {
    vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("cancelAnimationFrame", vi.fn());
    runtime = new ArcGISRuntime("eco"); layer = mockLayer(); factory.mockReset().mockResolvedValue(layer);
  });
  afterEach(() => { runtime.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("queries without geometry, shares the request signal, and releases its temporary layer", async () => {
    const result = await runtime.queryAttributes(service, { limit: 50, offset: 100 });
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ visible: false }), { trackLoad: false });
    const [query, options] = layer.queryFeatures.mock.calls[0]!;
    expect(query).toMatchObject({ start: 100, num: 50, returnGeometry: false, outFields: ["*"] });
    expect(layer.queryFeatureCount.mock.calls[0]![1].signal).toBe(options.signal);
    expect(result).toMatchObject({ total: 201, offset: 100, limit: 50, hasPrevious: true, hasNext: true });
    expect(layer.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not create a layer for an already cancelled query", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runtime.queryAttributes(service, { limit: 50, offset: 0 }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("cancels both network requests and releases only its owned layer", async () => {
    layer.queryFeatures.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController(); const operation = runtime.queryAttributes(service, { limit: 50, offset: 0 }, controller.signal);
    const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(layer.queryFeatures).toHaveBeenCalled()); controller.abort(); await rejected;
    expect(layer.queryFeatures.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(layer.queryFeatureCount.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(layer.cancelLoad).toHaveBeenCalledOnce(); expect(layer.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans up an unadopted layer created after cancellation", async () => {
    const pending = deferred<typeof layer>(); factory.mockReturnValue(pending.promise);
    const controller = new AbortController(); const operation = runtime.queryAttributes(service, { limit: 50, offset: 0 }, controller.signal);
    const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });
    await flush(); controller.abort(); await rejected; pending.resolve(layer); await flush();
    expect(layer.load).not.toHaveBeenCalled(); expect(layer.destroy).toHaveBeenCalledOnce();
  });
  it("does not cancel metadata or destroy a shared map layer when a query is stopped", async () => {
    (runtime as unknown as { layers: Map<string, unknown> }).layers.set(service.id, layer);
    layer.queryFeatures.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController(); const operation = runtime.queryAttributes(service, { limit: 50, offset: 0 }, controller.signal);
    const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });
    await flush(); controller.abort(); await rejected;
    expect(factory).not.toHaveBeenCalled(); expect(layer.load).toHaveBeenCalledWith();
    expect(layer.cancelLoad).not.toHaveBeenCalled(); expect(layer.destroy).not.toHaveBeenCalled();
  });
  it("aborts timed-out metadata work instead of leaving it running", async () => {
    layer.load.mockImplementation(() => new Promise(() => {}));
    const operation = runtime.queryAttributes(service); const rejected = expect(operation).rejects.toThrow("Katman sorgu hazırlığı zamanında tamamlanamadı");
    await vi.advanceTimersByTimeAsync(20_000); await rejected;
    expect(layer.cancelLoad).toHaveBeenCalledOnce(); expect(layer.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts the remaining request when the parallel count query fails", async () => {
    layer.queryFeatures.mockImplementation(() => new Promise(() => {})); layer.queryFeatureCount.mockRejectedValue(new Error("Count failed"));
    await expect(runtime.queryAttributes(service)).rejects.toThrow("Count failed");
    expect(layer.queryFeatures.mock.calls[0]![1].signal.aborted).toBe(true); expect(layer.destroy).toHaveBeenCalledOnce();
  });
  it("stops an in-flight query when its map session is destroyed", async () => {
    layer.queryFeatures.mockImplementation(() => new Promise(() => {}));
    const operation = runtime.queryAttributes(service); const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(layer.queryFeatures).toHaveBeenCalled()); runtime.destroy(); await rejected;
    expect(layer.queryFeatures.mock.calls[0]![1].signal.aborted).toBe(true); expect(layer.destroy).toHaveBeenCalledOnce();
  });
});
