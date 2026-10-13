import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runQueryStage } from "../src/gis/queryTask";

describe("cancellable query stages", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("does not start a pre-cancelled operation", async () => {
    const controller = new AbortController(); controller.abort(); const start = vi.fn();
    await expect(runQueryStage(start, controller, 100, "Sorgu")).rejects.toMatchObject({ name: "AbortError" });
    expect(start).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("stops waiting even when the transport ignores cancellation", async () => {
    const controller = new AbortController(); const operation = runQueryStage(() => new Promise(() => {}), controller, 100, "Sorgu");
    await Promise.resolve(); controller.abort();
    await expect(operation).rejects.toMatchObject({ name: "AbortError" }); expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts at the deadline and destroys a resource arriving afterwards exactly once", async () => {
    const controller = new AbortController(); let finish!: (value: string) => void; const release = vi.fn();
    const operation = runQueryStage(() => new Promise<string>(resolve => { finish = resolve; }), controller, 100, "Katman", release);
    const rejected = expect(operation).rejects.toThrow("Katman zamanında tamamlanamadı");
    await vi.advanceTimersByTimeAsync(100); await rejected;
    expect(controller.signal.aborted).toBe(true); finish("geç katman"); await Promise.resolve(); await Promise.resolve();
    expect(release).toHaveBeenCalledExactlyOnceWith("geç katman"); expect(vi.getTimerCount()).toBe(0);
  });
  it("clears the deadline after success and retains the adopted resource", async () => {
    const controller = new AbortController(); const release = vi.fn();
    await expect(runQueryStage(async () => "katman", controller, 100, "Katman", release)).resolves.toBe("katman");
    await vi.advanceTimersByTimeAsync(100); controller.abort();
    expect(release).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans up a synchronous SDK failure", async () => {
    const controller = new AbortController();
    await expect(runQueryStage(() => { throw new Error("SDK error"); }, controller, 100, "Sorgu")).rejects.toThrow("SDK error");
    expect(vi.getTimerCount()).toBe(0);
  });
});
