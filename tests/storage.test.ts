import { describe, expect, it } from "vitest";
import { sanitizePreferences } from "../src/lib/storage";

describe("storage preferences", () => {
  it("bozuk tercihleri güvenli varsayılanlara indirger", () => {
    const result = sanitizePreferences({
      basemap: "<script>",
      theme: "neon",
      performance: "ultra",
      layerVisibility: { "safe-layer": true, "<bad>": true },
      layerOpacity: { "safe-layer": 2.4, other: -1 },
      favorites: ["safe-layer", "safe-layer", "<bad>"],
      camera: { longitude: 500, latitude: 39, z: 1000, heading: 0, tilt: 45 }
    });

    expect(result.basemap).toBe("hybrid");
    expect(result.theme).toBe("dark");
    expect(result.performance).toBe("auto");
    expect(result.layerVisibility).toEqual({ "safe-layer": true });
    expect(result.layerOpacity).toEqual({ "safe-layer": 1, other: 0 });
    expect(result.favorites).toEqual(["safe-layer"]);
    expect(result.camera).toBeUndefined();
  });

  it("geçerli kamera ve bookmark verisini korur", () => {
    const result = sanitizePreferences({
      basemap: "satellite",
      theme: "light",
      performance: "balanced",
      camera: { longitude: 32.85, latitude: 39.92, z: 5200, heading: 2, tilt: 58 },
      bookmarks: [{
        id: "bookmark-1",
        name: " Merkez görünümü ",
        camera: { longitude: 32.85, latitude: 39.92, z: 5200, heading: 2, tilt: 58 },
        layerIds: ["layer-a", "layer-a", "<bad>"],
        createdAt: "2026-09-17T12:00:00.000Z"
      }]
    });

    expect(result.basemap).toBe("satellite");
    expect(result.camera?.latitude).toBeCloseTo(39.92);
    expect(result.bookmarks[0]?.name).toBe("Merkez görünümü");
    expect(result.bookmarks[0]?.layerIds).toEqual(["layer-a"]);
  });
});
