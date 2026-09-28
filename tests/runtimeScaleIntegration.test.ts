import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("live runtime scale reconciliation", () => {
  it("reconciles provider metadata before map attachment while deferring camera enforcement to the atomic plan", async () => {
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");

    expect(runtime).toContain("runtimeScaleRangeFromLoadedLayer");
    expect(runtime).toContain("reconcileServiceRuntimeScale");
    expect(runtime).toContain("runtimeScaleServices");
    expect(runtime).toContain("this.setScaleGuard(reconciledService, true, false)");
    expect(runtime).toContain("planAtomicLayerActivation");

    const finalize = runtime.indexOf("finalizeLoadedLayer(service, layer)");
    const reconcile = runtime.indexOf("runtimeScaleRangeFromLoadedLayer(layer)", finalize);
    const guard = runtime.indexOf("this.setScaleGuard(reconciledService, true, false)", reconcile);
    const add = runtime.indexOf("this.map?.add(layer)", guard);
    const plan = runtime.indexOf("this.executeAtomicActivationNavigation(reconciledService, layer, layerView)", add);
    expect(finalize).toBeGreaterThan(-1);
    expect(reconcile).toBeGreaterThan(finalize);
    expect(guard).toBeGreaterThan(reconcile);
    expect(add).toBeGreaterThan(guard);
    expect(plan).toBeGreaterThan(add);
  });

  it("keeps provider min/maxScale metadata unshadowed by constructor overrides", async () => {
    const factory = await readFile("src/gis/layerFactory.ts", "utf8");
    expect(factory).not.toContain("minScale: service.operationalMinScale");
    expect(factory).not.toContain("maxScale: service.operationalMaxScale");
    expect(factory).toContain("provider metadata");
  });

  it("drops the active zoom lock on hide and relearns metadata on explicit reload", async () => {
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");
    expect(runtime).toContain("this.setScaleGuard(service, false)");
    expect(runtime).toContain("this.runtimeScaleServices.delete(service.id)");
    expect(runtime).toContain("this.activeScaleServices.delete(service.id)");
  });
});
