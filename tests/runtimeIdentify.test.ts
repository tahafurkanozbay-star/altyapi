import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcGISRuntime } from "../src/gis/ArcGISRuntime";
import type { IdentifyResult, ToolId } from "../src/types";

vi.mock("@arcgis/core/core/reactiveUtils.js", async (original) => ({
  ...await original<typeof import("@arcgis/core/core/reactiveUtils.js")>(),
  watch: vi.fn(() => ({ remove: vi.fn() }))
}));

type Hit = { results: Array<{ type: "graphic"; graphic: { layer: { title: string }; attributes: Record<string, unknown> } }> };
const hit = (title: string): Hit => ({ results: [{ type: "graphic", graphic: { layer: { title }, attributes: { Mahalle: "Kavaklıdere" } } }] });
function deferred() {
  let resolve!: (value: Hit) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Hit>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("map selection ownership", () => {
  let runtime: ArcGISRuntime;
  let scene: EventTarget & { hitTest: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let documentTarget: EventTarget & { hidden: boolean };
  let publish: ReturnType<typeof vi.fn<(value: IdentifyResult | null) => void>>;
  let internals: { scene: typeof scene; activeToolId: ToolId; installSceneEvents(): void; createToolWidget(): Promise<unknown> };
  const click = () => scene.dispatchEvent(new CustomEvent("arcgisViewClick", { detail: { x: 10, y: 20 } }));
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    documentTarget = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("document", documentTarget);
    scene = Object.assign(new EventTarget(), { hitTest: vi.fn(), remove: vi.fn() });
    publish = vi.fn<(value: IdentifyResult | null) => void>();
    runtime = new ArcGISRuntime("eco");
    internals = runtime as unknown as typeof internals;
    Object.assign(internals, { scene, callbacks: { onIdentify: publish } });
    internals.installSceneEvents();
  });
  afterEach(() => { runtime.destroy(); vi.unstubAllGlobals(); });

  it("keeps the last clicked feature when older hit tests finish later", async () => {
    const old = deferred();
    scene.hitTest.mockReturnValueOnce(old.promise).mockResolvedValueOnce(hit("Son seçim"));
    click(); click(); await flush(); old.resolve(hit("Eski seçim")); await flush();
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Son seçim" }));
  });
  it("does not let an old failure clear the latest successful selection", async () => {
    const old = deferred();
    scene.hitTest.mockReturnValueOnce(old.promise).mockResolvedValueOnce(hit("Son seçim"));
    click(); click(); await flush(); old.reject(new Error("Old GPU request")); await flush();
    expect(publish).toHaveBeenCalledOnce();
  });
  it.each(["close", "navigate", "hide", "replace", "destroy"])("ignores a pending selection after %s", async (action) => {
    const pending = deferred(); scene.hitTest.mockReturnValue(pending.promise); click();
    if (action === "close") runtime.clearIdentify();
    if (action === "navigate") scene.dispatchEvent(new Event("arcgisViewChange"));
    if (action === "hide") { documentTarget.hidden = true; documentTarget.dispatchEvent(new Event("visibilitychange")); documentTarget.hidden = false; }
    if (action === "replace") internals.scene = Object.assign(new EventTarget(), { hitTest: vi.fn(), remove: vi.fn() });
    if (action === "destroy") runtime.destroy();
    publish.mockClear(); pending.resolve(hit("Eski sonuç")); await flush();
    expect(publish).not.toHaveBeenCalled();
  });
  it.each(["distance", "area", "slice", "lineOfSight", "elevation"] as const)("leaves map clicks to the %s tool", async (tool) => {
    internals.activeToolId = tool; click(); await flush();
    expect(scene.hitTest).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
  });
  it.each(["legend", "basemap", "daylight"] as const)("allows feature inspection with the passive %s tool", async (tool) => {
    internals.activeToolId = tool; scene.hitTest.mockResolvedValue(hit("Nesne")); click(); await flush();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Nesne" }));
  });
  it("claims map input before a drawing component finishes loading", async () => {
    const pending = deferred(); scene.hitTest.mockReturnValue(pending.promise); click();
    let finish!: (value: unknown) => void;
    vi.spyOn(internals, "createToolWidget").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const opening = runtime.openTool("area", { replaceChildren() {}, isConnected: true } as unknown as HTMLDivElement);
    publish.mockClear(); pending.resolve(hit("Eski seçim")); click(); await flush();
    expect(publish).not.toHaveBeenCalled(); expect(scene.hitTest).toHaveBeenCalledOnce();
    finish({ remove: vi.fn() }); await opening;
    runtime.closeTool(); scene.hitTest.mockResolvedValue(hit("Yeni seçim")); click(); await flush();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Yeni seçim" }));
  });
  it("restores feature inspection when a drawing component fails to load", async () => {
    vi.spyOn(internals, "createToolWidget").mockRejectedValue(new Error("SDK import failed"));
    await expect(runtime.openTool("area", { replaceChildren() {} } as unknown as HTMLDivElement)).rejects.toThrow("SDK import failed");
    publish.mockClear(); scene.hitTest.mockResolvedValue(hit("İncelenen nesne")); click(); await flush();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ title: "İncelenen nesne" }));
  });
});
