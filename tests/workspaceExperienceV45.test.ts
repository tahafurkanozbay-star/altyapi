import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { sanitizePreferences } from "../src/lib/storage";
import { mergeCapturedLayerOrder, moveVisibleLayer, normalizeLayerOrder } from "../src/lib/workspaceView";

describe("v45 citizen workspace experience", () => {
  it("keeps a deterministic complete top-to-bottom layer order", () => {
    expect(normalizeLayerOrder(["c", "a", "c", "missing"], ["a", "b", "c", "d"]))
      .toEqual(["c", "a", "b", "d"]);
  });

  it("moves relative to visible neighbors without disturbing hidden slots", () => {
    const order = ["top", "hidden-a", "middle", "hidden-b", "bottom"];
    expect(moveVisibleLayer(order, ["top", "middle", "bottom"], "middle", "up"))
      .toEqual(["middle", "hidden-a", "top", "hidden-b", "bottom"]);
    expect(moveVisibleLayer(order, ["top", "middle", "bottom"], "middle", "down"))
      .toEqual(["top", "hidden-a", "bottom", "hidden-b", "middle"]);
  });

  it("restores a captured visible stack while preserving uncaptured services", () => {
    expect(mergeCapturedLayerOrder(
      ["a", "b", "c", "d"],
      ["d", "b"],
      ["a", "b", "c", "d", "e"]
    )).toEqual(["d", "b", "a", "c", "e"]);
  });

  it("sanitizes full workspace bookmarks and remains compatible with older preferences", () => {
    const legacy = sanitizePreferences({ basemap: "hybrid", bookmarks: [] });
    expect(legacy.layerOrder).toEqual([]);

    const restored = sanitizePreferences({
      basemap: "hybrid",
      layerOrder: ["layer-a", "layer-b"],
      bookmarks: [{
        id: "bookmark-1",
        name: "  Merkez çalışma görünümü  ",
        camera: { longitude: 32.85, latitude: 39.92, z: 5000, heading: 0, tilt: 45 },
        layerIds: ["layer-a", "layer-b"],
        layerOrder: ["layer-b", "layer-a"],
        layerOpacity: { "layer-a": 0.45, "layer-b": 2 },
        basemap: "topo-vector",
        createdAt: "2026-10-01T12:00:00.000Z"
      }]
    });

    expect(restored.layerOrder).toEqual(["layer-a", "layer-b"]);
    expect(restored.bookmarks[0]).toMatchObject({
      name: "Merkez çalışma görünümü",
      basemap: "topo-vector",
      layerOrder: ["layer-b", "layer-a"],
      layerOpacity: { "layer-a": 0.45, "layer-b": 1 }
    });
  });

  it("ships the accessible naming flow, native sharing and runtime draw-order bridge", async () => {
    const [app, dialog, explorer, runtime, entry, css] = await Promise.all([
      readFile("src/App.tsx", "utf8"),
      readFile("src/components/BookmarkDialog.tsx", "utf8"),
      readFile("src/components/LayerExplorer.tsx", "utf8"),
      readFile("src/gis/ArcGISRuntime.ts", "utf8"),
      readFile("src/main.tsx", "utf8"),
      readFile("src/styles/experience-v45.css", "utf8")
    ]);

    expect(app).not.toContain("window.prompt");
    expect(app).toContain('typeof navigator.share === "function"');
    expect(app).toContain("toggleFullscreen");
    expect(app).toContain("layerOrder={effectiveLayerOrder}");
    expect(app).toContain("<BookmarkDialog");
    expect(dialog).toContain("showModal");
    expect(dialog).toContain("Kamera konumu, açık katmanlar");
    expect(explorer).toContain("Açık katman yığını");
    expect(explorer).toContain("onMoveLayer");
    expect(runtime).toContain("setLayerOrder(serviceIdsTopToBottom");
    expect(runtime).toContain("map.reorder(layer, index)");
    expect(entry).toContain('import "./styles/experience-v45.css"');
    expect(css).toContain(".workspace-dialog");
    expect(css).toContain(".layer-stack-editor");

    // Release/cache generation coherence is intentionally owned by
    // releaseCoherence.test.ts. This regression suite protects v45 workspace
    // behavior across later releases instead of pinning the package to v45.
  });
});
