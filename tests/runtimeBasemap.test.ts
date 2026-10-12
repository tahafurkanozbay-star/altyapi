import { describe, expect, it, vi } from "vitest";
import { ArcGISRuntime } from "../src/gis/ArcGISRuntime";
import { BASEMAP_OPTIONS, supportedBasemapId } from "../src/lib/basemaps";

describe("basemap selection", () => {
  it("recognizes the same six choices from string and SDK model values", () => {
    expect(BASEMAP_OPTIONS).toHaveLength(6);
    for (const [id] of BASEMAP_OPTIONS) {
      expect(supportedBasemapId(id)).toBe(id);
      expect(supportedBasemapId({ id })).toBe(id);
    }
    for (const value of [null, undefined, 1, {}, { id: 3 }, "unknown", { id: "portal-item-id" }]) {
      expect(supportedBasemapId(value)).toBeUndefined();
    }
  });

  const fixture = () => {
    const runtime = new ArcGISRuntime("eco");
    const onBasemapChange = vi.fn();
    const gallery = Object.assign(new EventTarget(), { isConnected: true, activeBasemap: { id: "topo-vector" } });
    const internals = runtime as unknown as {
      destroyed: boolean;
      callbacks: { onBasemapChange: typeof onBasemapChange };
      bindBasemapSelection(component: unknown): void;
    };
    internals.callbacks = { onBasemapChange };
    internals.bindBasemapSelection(gallery);
    const change = (name = "activeBasemap") => gallery.dispatchEvent(new CustomEvent("arcgisPropertyChange", { detail: { name } }));
    return { internals, gallery, onBasemapChange, change };
  };

  it("publishes actual gallery selection to the application", () => {
    const { onBasemapChange, change } = fixture();
    change();
    expect(onBasemapChange).toHaveBeenCalledExactlyOnceWith("topo-vector");
  });

  it("ignores unrelated state changes and unsupported basemaps", () => {
    const { onBasemapChange, gallery, change } = fixture();
    change("state");
    gallery.activeBasemap = { id: "unknown" };
    change();
    expect(onBasemapChange).not.toHaveBeenCalled();
  });

  it("ignores updates from a closed gallery or destroyed runtime", () => {
    const { internals, onBasemapChange, gallery, change } = fixture();
    gallery.isConnected = false;
    change();
    gallery.isConnected = true;
    internals.destroyed = true;
    change();
    expect(onBasemapChange).not.toHaveBeenCalled();
  });

  it("restores the canonical ID and label after SDK metadata overwrites them", async () => {
    const runtime = new ArcGISRuntime("eco");
    let resolve!: () => void;
    const loaded = new Promise<void>((done) => { resolve = done; });
    const basemap = { id: "generated-id", title: "Basemap", load: () => loaded };
    (runtime as unknown as { retainBasemapIdentity(model: unknown, id: string): void }).retainBasemapIdentity(basemap, "topo-vector");
    expect(basemap).toMatchObject({ id: "topo-vector", title: "Topoğrafik" });
    basemap.id = "server-id";
    basemap.title = "Topografik";
    resolve();
    await loaded;
    expect(basemap).toMatchObject({ id: "topo-vector", title: "Topoğrafik" });
  });

  it("keeps stable choices without hiding a failed SDK load", async () => {
    const runtime = new ArcGISRuntime("eco");
    const loaded = Promise.reject(new Error("provider unavailable"));
    const basemap = { id: "generated-id", title: "Basemap", loadStatus: "failed", load: () => loaded };
    (runtime as unknown as { retainBasemapIdentity(model: unknown, id: string): void }).retainBasemapIdentity(basemap, "hybrid");
    basemap.title = "Etiketli Görüntüler";
    await loaded.catch(() => undefined);
    expect(basemap).toMatchObject({ id: "hybrid", title: "Hibrit", loadStatus: "failed" });
  });
});
