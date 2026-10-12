import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForComponentReady } from "../src/gis/componentReadiness";

afterEach(() => vi.useRealTimers());

describe("actual SDK component readiness", () => {
  it("waits for the associated view's ready event", async () => {
    const element = new EventTarget();
    const pending = waitForComponentReady(element, new AbortController().signal);
    element.dispatchEvent(new Event("arcgisReady"));
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects promptly when the user closes a pending tool", async () => {
    const element = new EventTarget();
    const controller = new AbortController();
    const pending = waitForComponentReady(element, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    element.dispatchEvent(new Event("arcgisReady"));
  });

  it("does not leak listeners or deadlines after readiness", async () => {
    vi.useFakeTimers();
    const element = new EventTarget();
    const remove = vi.spyOn(element, "removeEventListener");
    const pending = waitForComponentReady(element, new AbortController().signal);
    element.dispatchEvent(new Event("arcgisReady"));
    await pending;
    expect(remove).toHaveBeenCalledWith("arcgisReady", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails a never-ready component with a bounded timeout", async () => {
    vi.useFakeTimers();
    const pending = waitForComponentReady(new EventTarget(), new AbortController().signal, 500);
    const assertion = expect(pending).rejects.toThrow("zamanında hazırlanamadı");
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
