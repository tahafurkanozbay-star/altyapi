import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRenderProbe, waitForRenderFrames } from "../src/gis/firstRenderProbe";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("bounded first-render evidence", () => {
  it("deduplicates reads of the same current view", async () => {
    let resolve!: (ready: boolean) => void;
    const read = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const onReady = vi.fn();
    const value = {};
    const probe = new FirstRenderProbe({ isCurrent: () => true, read, onReady });
    const first = probe.request("layer", value);
    expect(probe.request("layer", value)).toBe(first);
    await Promise.resolve();
    resolve(true);
    await expect(first).resolves.toBe(true);
    expect(read).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledExactlyOnceWith("layer", value);
  });

  it("ignores a late result after navigation or layer cancellation", async () => {
    let resolve!: (ready: boolean) => void;
    let current = true;
    const onReady = vi.fn();
    const probe = new FirstRenderProbe({ isCurrent: () => current, read: () => new Promise<boolean>((done) => { resolve = done; }), onReady });
    const pending = probe.request("layer", {});
    await Promise.resolve();
    current = false;
    resolve(true);
    await expect(pending).resolves.toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("lets a newer viewport replace an old in-flight read", async () => {
    const resolvers = new Map<number, (ready: boolean) => void>();
    const onReady = vi.fn();
    const probe = new FirstRenderProbe<number>({ isCurrent: () => true, read: (value) => new Promise((done) => resolvers.set(value, done)), onReady });
    const old = probe.request("layer", 1);
    await Promise.resolve();
    const next = probe.request("layer", 2);
    await Promise.resolve();
    resolvers.get(1)!(true);
    resolvers.get(2)!(true);
    await expect(old).resolves.toBe(false);
    await expect(next).resolves.toBe(true);
    expect(onReady).toHaveBeenCalledExactlyOnceWith("layer", 2);
  });

  it("releases a query that ignores abort when its deadline expires", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const onReady = vi.fn();
    const probe = new FirstRenderProbe({ isCurrent: () => true, read: (_, input) => { signal = input; return new Promise<boolean>(() => {}); }, onReady, timeoutMs: 500 });
    const pending = probe.request("layer", {});
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBe(false);
    expect(signal.aborted).toBe(true);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("does not start cancelled or disposed work", async () => {
    const read = vi.fn(async () => true);
    const probe = new FirstRenderProbe({ isCurrent: () => true, read, onReady: vi.fn() });
    const pending = probe.request("layer", {});
    probe.cancel("layer");
    await expect(pending).resolves.toBe(false);
    probe.dispose();
    await expect(probe.request("other", {})).resolves.toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("does not turn query failures or empty evidence into readiness", async () => {
    const onReady = vi.fn();
    const probe = new FirstRenderProbe({ isCurrent: () => true, read: async (value: number) => { if (value) throw new Error("query failed"); return false; }, onReady });
    await expect(probe.request("empty", 0)).resolves.toBe(false);
    await expect(probe.request("failed", 1)).resolves.toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("cancels pending paint frames when a panel or view closes", async () => {
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(1, callback); return 1; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const controller = new AbortController();
    const pending = waitForRenderFrames(controller.signal);
    expect(frames.size).toBe(1);
    controller.abort();
    await expect(pending).resolves.toBe(false);
    expect(frames.size).toBe(0);
  });
});
