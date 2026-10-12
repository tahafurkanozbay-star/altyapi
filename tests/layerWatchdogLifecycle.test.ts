import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSceneLayerWatchdog } from "../src/gis/layerViewWatchdog";

class ElementStub extends EventTarget {
  id = "altyapi-main-scene";
  isConnected = true;
}

describe("LayerView recovery ownership", () => {
  let stop: (() => void) | undefined;
  let doc: EventTarget;
  let scene: ElementStub & { map: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; layers: { indexOf(): number } } };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("HTMLElement", ElementStub);
    scene = Object.assign(new ElementStub(), { map: { add: vi.fn(), remove: vi.fn(), layers: { indexOf: () => 2 } } });
    doc = Object.assign(new EventTarget(), { getElementById: () => scene, hidden: false });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
    stop = installSceneLayerWatchdog();
  });

  afterEach(() => { stop?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  const fail = (layer: { id: string; visible: boolean }, message = "temporary rendering failure") => {
    doc.dispatchEvent(new CustomEvent("arcgisViewLayerviewCreateError", { detail: { layer, error: new Error(message) } }));
  };

  it("cancels scheduled recovery when the observer is disposed", async () => {
    fail({ id: "svc-water", visible: true });
    stop!();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(scene.map.remove).not.toHaveBeenCalled();
    expect(scene.map.add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a layer hidden during recovery attached to its reusable cache", async () => {
    const layer = { id: "svc-water", visible: true };
    scene.map.remove.mockImplementation(() => { layer.visible = false; });
    fail(layer);
    await vi.advanceTimersByTimeAsync(320);
    expect(scene.map.remove).toHaveBeenCalledExactlyOnceWith(layer);
    expect(scene.map.add).toHaveBeenCalledExactlyOnceWith(layer, 2);
    expect(layer.visible).toBe(false);
  });

  it("does not recycle an authentication failure", async () => {
    fail({ id: "svc-water", visible: true }, "403 Forbidden");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(scene.map.remove).not.toHaveBeenCalled();
  });

  it("lets an in-flight export finish before the SDK request deadline", async () => {
    Object.assign(scene, { stationary: true, updating: true });
    const layerView = {
      layer: { id: "svc-plan", type: "map-image", visible: true },
      visible: true, visibleAtCurrentScale: true, suspended: false, updating: true
    };
    const phases: string[] = [];
    window.addEventListener("altyapi:layerview-health", (event) => {
      phases.push((event as CustomEvent<{ phase: string }>).detail.phase);
    });
    doc.dispatchEvent(new CustomEvent("arcgisViewLayerviewCreate", { detail: { layerView } }));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(scene.map.remove).not.toHaveBeenCalled();
    layerView.updating = false;
    Object.assign(scene, { updating: false });
    doc.dispatchEvent(new CustomEvent("arcgisViewChange"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(phases).toContain("stable");
    expect(phases).not.toContain("recycle-attempt");
    expect(scene.map.remove).not.toHaveBeenCalled();
  });
});
