import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  initialLayerRenderHealthState,
  layerRenderHealthReducer,
  layerRenderHealthVisualStatus,
  parseLayerViewHealthEvent,
  retainVisibleRenderHealth
} from "../src/lib/layerRenderHealth";

describe("LayerView render health UI state", () => {
  it("validates watchdog events before they reach the UI", () => {
    expect(parseLayerViewHealthEvent({ layerId: "1", state: "stable" })).toEqual({
      layerId: "1",
      state: "stable"
    });
    expect(parseLayerViewHealthEvent({ layerId: "1", state: "render-stalled", message: "Gecikti" })).toEqual({
      layerId: "1",
      state: "render-stalled",
      message: "Gecikti"
    });
    expect(parseLayerViewHealthEvent({ layerId: "1", state: "unknown" })).toBeNull();
    expect(parseLayerViewHealthEvent({ layerId: "1", state: "stable", extra: true })).toEqual({
      layerId: "1",
      state: "stable"
    });
    expect(parseLayerViewHealthEvent(null)).toBeNull();
  });

  it("maps the complete watchdog lifecycle to citizen-facing render states", () => {
    let state = initialLayerRenderHealthState;
    state = layerRenderHealthReducer(state, { layerId: "1", state: "created" });
    expect(state["1"]?.state).toBe("preparing");
    expect(layerRenderHealthVisualStatus(state["1"])).toBe("loading");

    state = layerRenderHealthReducer(state, { layerId: "1", state: "scale-adjusted" });
    expect(state["1"]?.state).toBe("scale-adjusting");

    state = layerRenderHealthReducer(state, { layerId: "1", state: "stable" });
    expect(state["1"]?.state).toBe("ready");
    expect(layerRenderHealthVisualStatus(state["1"])).toBe("ready");

    state = layerRenderHealthReducer(state, { layerId: "1", state: "recovery-attempt", message: "Yeniden bağlanıyor" });
    expect(state["1"]?.state).toBe("recovering");
    expect(state["1"]?.message).toBe("Yeniden bağlanıyor");

    state = layerRenderHealthReducer(state, { layerId: "1", state: "render-stalled", message: "Render gecikti" });
    expect(state["1"]?.state).toBe("stalled");
    expect(layerRenderHealthVisualStatus(state["1"])).toBe("loading");

    state = layerRenderHealthReducer(state, { layerId: "1", state: "recovery-exhausted", message: "Bitti" });
    expect(state["1"]?.state).toBe("failed");
    expect(layerRenderHealthVisualStatus(state["1"])).toBe("error");
  });

  it("drops render state as soon as a layer is no longer visible", () => {
    const current = {
      "1": { state: "ready" as const, updatedAt: 1 },
      "2": { state: "failed" as const, updatedAt: 2 }
    };
    expect(retainVisibleRenderHealth(current, new Set(["2"]))).toEqual({
      "2": { state: "failed", updatedAt: 2 }
    });
    expect(retainVisibleRenderHealth(current, new Set(["1", "2"]))).toBe(current);
  });

  it("persists watchdog health outside the panel lifecycle and exposes render recovery", async () => {
    const main = await readFile("src/main.tsx", "utf8");
    const store = await readFile("src/lib/layerRenderHealth.ts", "utf8");
    const bridge = await readFile("src/platform/runtimeEventDomBridge.ts", "utf8");
    const watchdog = await readFile("src/gis/layerViewWatchdog.ts", "utf8");
    const explorer = await readFile("src/components/LayerExplorer.tsx", "utf8");

    expect(main).toContain("installRuntimeEventDomBridge();");
    expect(main).toContain("installLayerRenderHealthStore();");
    expect(main.indexOf("installRuntimeEventDomBridge();")).toBeLessThan(main.indexOf("installLayerRenderHealthStore();"));
    expect(main.indexOf("installLayerRenderHealthStore();")).toBeLessThan(main.indexOf("installSceneLayerWatchdog();"));
    expect(store).toContain('subscribeRuntimeEvent("layer-render-health"');
    expect(store).not.toContain('window.addEventListener("altyapi:layerview-health"');
    expect(bridge).toContain('window.addEventListener(LEGACY_LAYER_RENDER_HEALTH_EVENT');
    expect(store).toContain("subscribeLayerRenderHealth");
    expect(watchdog).toContain('emitHealth(layerId, "render-stalled"');
    expect(watchdog).toContain("recyclePending");
    expect(explorer).toContain("useSyncExternalStore");
    expect(explorer).toContain("Haritada hazırlanıyor");
    expect(explorer).toContain("Harita görünümünü yeniden hazırla");
    expect(explorer).toContain("data-render-state");
    expect(explorer).toContain("haritada hazır");
  });
});
