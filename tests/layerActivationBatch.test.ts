import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v33 batch layer activation", () => {
  it("holds per-layer navigation and scale repair until the batch commits", async () => {
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");

    expect(runtime).toContain("withLayerActivationBatch");
    expect(runtime).toContain("deferredActivationNavigations");
    expect(runtime).toContain("flushDeferredActivationNavigation");
    expect(runtime).toContain("selectBatchActivationCandidate");
    expect(runtime).toContain("this.activationBatchDepth > 0");
    expect(runtime).toContain("beginAtomicLayerActivation(layer.id)");
    expect(runtime).toContain("releaseDeferredActivation");
    expect(runtime).toContain("this.activationBatchDepth === 0");
  });

  it("uses one batch for startup restore and preserves bookmark camera authority", async () => {
    const app = await readFile("src/App.tsx", "utf8");

    expect(app).toContain("runtime.withLayerActivationBatch(async () =>");
    expect(app).toContain("{ navigate: !share?.camera }");
    expect(app).toContain("{ navigate: false }");

    const bookmarkBatch = app.indexOf("const goBookmark");
    const explicitCamera = app.indexOf("await runtime.goTo(bookmark.camera)", bookmarkBatch);
    const suppressedBatch = app.indexOf("{ navigate: false }", bookmarkBatch);
    expect(bookmarkBatch).toBeGreaterThan(-1);
    expect(suppressedBatch).toBeGreaterThan(bookmarkBatch);
    expect(explicitCamera).toBeGreaterThan(suppressedBatch);
  });
});
