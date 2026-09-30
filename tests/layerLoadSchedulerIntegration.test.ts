import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v34 layer load scheduler integration", () => {
  it("routes restore, interactive and retry layer loads through one scheduler", async () => {
    const app = await readFile("src/App.tsx", "utf8");
    const scheduler = await readFile("src/gis/layerLoadScheduler.ts", "utf8");

    expect(app).toContain("new LayerLoadScheduler(effectivePerformance)");
    expect(app).toContain('"restore",\n              () => runtime.setLayerVisible(service, true)');
    expect(app).toContain('priority: LayerLoadPriority = "interactive"');
    expect(app).toContain('"retry",\n      () => runtime.reloadLayer(retryService)');
    expect(app).toContain("layerLoadScheduler.cancel(service.id)");
    expect(app).toContain('toggleLayer(service, desired.has(service.id), "restore")');
    expect(app).not.toContain("mapWithConcurrency");

    expect(scheduler).toContain("interactive: 0");
    expect(scheduler).toContain("retry: 1");
    expect(scheduler).toContain("restore: 2");
    expect(scheduler).toContain('service.kind === "WMS" || service.kind === "WFS"');
    expect(scheduler).toContain("profile === \"high\" ? 2 : 1");
    expect(scheduler).not.toContain("console.");
    expect(scheduler).not.toContain("localStorage");
  });
});
