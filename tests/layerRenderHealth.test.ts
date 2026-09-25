import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  isLayerRenderFailure,
  layerRenderHealthLabel,
  layerRenderHealthVisualStatus,
  parseLayerRenderHealthDetail,
  reduceLayerRenderHealth,
  retainVisibleRenderHealth
} from "../src/lib/layerRenderHealth";

describe("LayerView render health UI state", () => {
  it("validates watchdog events before they reach the UI", () => {
    expect(parseLayerRenderHealthDetail({
      phase: "scale-repair",
      layerId: "svc-12",
      serviceId: "12",
      targetScale: 394000
    })).toEqual({
      phase: "scale-repair",
      layerId: "svc-12",
      serviceId: "12",
      targetScale: 394000
    });

    expect(parseLayerRenderHealthDetail({ phase: "stable", layerId: "svc-12", serviceId: "13" })).toBeNull();
    expect(parseLayerRenderHealthDetail({ phase: "unknown", layerId: "svc-12", serviceId: "12" })).toBeNull();
    expect(parseLayerRenderHealthDetail({ phase: "stable", layerId: "foreign-12", serviceId: "12" })).toBeNull();
  });

  it("maps the complete watchdog lifecycle to citizen-facing render states", () => {
    const created = reduceLayerRenderHealth(undefined, {
      phase: "created",
      layerId: "svc-2",
      serviceId: "2"
    }, 10);
    expect(created).toEqual({ state: "preparing", updatedAt: 10 });
    expect(layerRenderHealthVisualStatus(created)).toBe("loading");

    const scaleRepair = reduceLayerRenderHealth(created, {
      phase: "scale-repair",
      layerId: "svc-2",
      serviceId: "2",
      targetScale: 300000
    }, 20);
    expect(scaleRepair?.state).toBe("scale-adjusting");
    expect(layerRenderHealthLabel(scaleRepair)).toContain("1:300.000");

    const recovering = reduceLayerRenderHealth(scaleRepair, {
      phase: "recycle-attempt",
      layerId: "svc-2",
      serviceId: "2",
      attempt: 2
    }, 30);
    expect(layerRenderHealthLabel(recovering)).toBe("Render kurtarılıyor · 2. deneme");

    const failed = reduceLayerRenderHealth(recovering, {
      phase: "recovery-exhausted",
      layerId: "svc-2",
      serviceId: "2",
      attempt: 2
    }, 40);
    expect(isLayerRenderFailure(failed)).toBe(true);
    expect(layerRenderHealthVisualStatus(failed)).toBe("error");

    const stable = reduceLayerRenderHealth(failed, {
      phase: "stable",
      layerId: "svc-2",
      serviceId: "2"
    }, 50);
    expect(stable).toEqual({ state: "ready", updatedAt: 50 });
    expect(layerRenderHealthVisualStatus(stable)).toBe("ready");

    expect(reduceLayerRenderHealth(stable, {
      phase: "destroyed",
      layerId: "svc-2",
      serviceId: "2"
    }, 60)).toBeUndefined();
  });

  it("drops render state as soon as a layer is no longer visible", () => {
    const current = {
      "1": { state: "ready", updatedAt: 1 } as const,
      "2": { state: "failed", updatedAt: 2 } as const
    };
    expect(retainVisibleRenderHealth(current, new Set(["2"]))).toEqual({
      "2": { state: "failed", updatedAt: 2 }
    });
    expect(retainVisibleRenderHealth(current, new Set(["1", "2"]))).toBe(current);
  });

  it("persists watchdog health outside the panel lifecycle and exposes render recovery", async () => {
    const main = await readFile("src/main.tsx", "utf8");
    const store = await readFile("src/lib/layerRenderHealth.ts", "utf8");
    const explorer = await readFile("src/components/LayerExplorer.tsx", "utf8");

    expect(main).toContain("installLayerRenderHealthStore();");
    expect(main.indexOf("installLayerRenderHealthStore();")).toBeLessThan(main.indexOf("installSceneLayerWatchdog();"));
    expect(store).toContain('window.addEventListener("altyapi:layerview-health"');
    expect(store).toContain("subscribeLayerRenderHealth");
    expect(explorer).toContain("useSyncExternalStore");
    expect(explorer).toContain("Render bekleniyor");
    expect(explorer).toContain("Render katmanını yeniden oluştur");
    expect(explorer).toContain("data-render-state");
    expect(explorer).toContain("render hazır");
  });
});
