import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcGISRuntime } from "../src/gis/ArcGISRuntime";
import type { SceneTelemetry } from "../src/types";

type TestScene = EventTarget & {
  center: { latitude: number; longitude: number };
  scale: number;
  camera: { position: { z: number }; tilt: number; heading: number };
  toMap: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

describe("live scene telemetry", () => {
  let runtime: ArcGISRuntime;
  let scene: TestScene;
  let documentTarget: EventTarget & { hidden: boolean };
  let telemetry: ReturnType<typeof vi.fn<(value: SceneTelemetry) => void>>;
  let frames: Map<number, FrameRequestCallback>;

  const flushFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    frames = new Map();
    let nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (frame: number) => frames.delete(frame));
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    documentTarget = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("document", documentTarget);
    scene = Object.assign(new EventTarget(), {
      center: { latitude: 39.91, longitude: 32.85 },
      scale: 12_500,
      camera: { position: { z: 5200 }, tilt: 58, heading: 2 },
      toMap: vi.fn(() => ({ latitude: 39.92, longitude: 32.86 })),
      remove: vi.fn()
    });
    telemetry = vi.fn<(value: SceneTelemetry) => void>();
    runtime = new ArcGISRuntime("eco");
    const internals = runtime as unknown as {
      scene: TestScene;
      callbacks: { onTelemetry: typeof telemetry };
      installSceneEvents(): void;
    };
    internals.scene = scene;
    internals.callbacks = { onTelemetry: telemetry };
    internals.installSceneEvents();
  });

  afterEach(() => {
    runtime.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("publishes the actual initial scale and map center without mouse movement", () => {
    flushFrame();
    expect(telemetry).toHaveBeenLastCalledWith({
      latitude: 39.91, longitude: 32.85, scale: 12_500,
      altitude: 5200, tilt: 58, heading: 2
    });
    expect(scene.toMap).not.toHaveBeenCalled();
  });

  it("updates after camera or touch navigation without pointer events", () => {
    flushFrame();
    scene.scale = 6000;
    scene.center = { latitude: 39.95, longitude: 32.9 };
    scene.dispatchEvent(new Event("arcgisViewChange"));
    flushFrame();
    expect(telemetry).toHaveBeenLastCalledWith(expect.objectContaining({ scale: 6000, latitude: 39.95, longitude: 32.9 }));
  });

  it("coalesces pointer samples and returns to the current map center on navigation", () => {
    flushFrame();
    scene.dispatchEvent(new CustomEvent("arcgisViewPointerMove", { detail: { x: 10, y: 20 } }));
    scene.dispatchEvent(new CustomEvent("arcgisViewPointerMove", { detail: { x: 30, y: 40 } }));
    expect(frames.size).toBe(1);
    expect(scene.toMap).not.toHaveBeenCalled();
    flushFrame();
    expect(scene.toMap).toHaveBeenCalledExactlyOnceWith({ x: 30, y: 40 });
    expect(telemetry).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: 39.92, longitude: 32.86 }));
    scene.dispatchEvent(new Event("arcgisViewChange"));
    flushFrame();
    expect(telemetry).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: 39.91, longitude: 32.85 }));
  });

  it("refreshes the current scale on tab return without publishing hidden frames", () => {
    documentTarget.hidden = true;
    flushFrame();
    expect(telemetry).not.toHaveBeenCalled();
    scene.scale = 30_000;
    scene.dispatchEvent(new Event("arcgisViewChange"));
    expect(frames.size).toBe(0);
    documentTarget.hidden = false;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    flushFrame();
    expect(telemetry).toHaveBeenLastCalledWith(expect.objectContaining({ scale: 30_000 }));
  });

  it("cancels pending telemetry and detaches events on destruction", () => {
    runtime.destroy();
    expect(frames.size).toBe(0);
    scene.dispatchEvent(new Event("arcgisViewChange"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    flushFrame();
    expect(telemetry).not.toHaveBeenCalled();
  });
});
