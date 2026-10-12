import { describe, expect, it, vi } from "vitest";
import { ArcGISRuntime } from "../src/gis/ArcGISRuntime";
import { normalizeService } from "../src/lib/catalog";

const service = normalizeService({
  ustKurumAdi: "ABB", metaveriSahibiKurumAdi: "ABB", cografiVeriKatmanAdi: "water",
  servisTuruAdi: "FeatureServer", tokenUrl: "https://example.org/FeatureServer/0"
}, 0);

describe("runtime interaction races", () => {
  it("does not restart a retry after the user cancels it while a previous load settles", async () => {
    const runtime = new ArcGISRuntime("eco");
    const internals = runtime as unknown as {
      scene: unknown; map: unknown;
      loadingLayers: Map<string, Promise<{ ok: boolean }>>;
    };
    internals.scene = {};
    internals.map = {};
    let resolve!: (result: { ok: boolean }) => void;
    internals.loadingLayers.set(service.id, new Promise((next) => { resolve = next; }));
    const retry = runtime.reloadLayer(service);
    await runtime.setLayerVisible(service, false);
    resolve({ ok: true });
    await expect(retry).resolves.toMatchObject({ ok: true, superseded: true });
  });

  it("disposes a late tool component after its panel has been closed", async () => {
    const runtime = new ArcGISRuntime("eco");
    const internals = runtime as unknown as { scene: unknown; createToolWidget: () => Promise<HTMLElement>; disposeComponent: (widget: HTMLElement) => void };
    internals.scene = {};
    const widget = {} as HTMLElement;
    let resolve!: (widget: HTMLElement) => void;
    internals.createToolWidget = () => new Promise((next) => { resolve = next; });
    const dispose = vi.spyOn(internals, "disposeComponent").mockImplementation(() => undefined);
    const container = { replaceChildren() {}, isConnected: true } as unknown as HTMLDivElement;
    const opening = runtime.openTool("legend", container);
    runtime.closeTool();
    resolve(widget);
    await opening;
    expect(dispose).toHaveBeenCalledWith(widget);
  });
});
