import { describe, expect, it } from "vitest";
import { parseWorkspace, serializeWorkspace } from "../src/lib/workspace";
import type { AppPreferences } from "../src/types";

const preferences: AppPreferences = {
  basemap: "hybrid",
  theme: "dark",
  performance: "balanced",
  layerVisibility: { "layer-a": true },
  layerOpacity: { "layer-a": 0.75 },
  favorites: ["layer-a"],
  bookmarks: [],
  camera: { longitude: 32.85, latitude: 39.92, z: 5000, heading: 4, tilt: 55 }
};

describe("workspace portability", () => {
  it("serializes a versioned document and forces the comfort-white theme", () => {
    const text = serializeWorkspace(preferences, "8.0.0");
    const parsed = parseWorkspace(text);
    expect(parsed.schema).toBe("baskent-3b-workspace");
    expect(parsed.version).toBe(1);
    expect(parsed.applicationVersion).toBe("8.0.0");
    expect(parsed.preferences.theme).toBe("light");
    expect(parsed.preferences.layerOpacity["layer-a"]).toBe(0.75);
  });

  it("rejects unrelated or malformed JSON", () => {
    expect(() => parseWorkspace("{not-json")).toThrow(/JSON/i);
    expect(() => parseWorkspace(JSON.stringify({ schema: "other", version: 1 }))).toThrow(/Desteklenmeyen/i);
  });

  it("sanitizes unsafe preference payloads during import", () => {
    const parsed = parseWorkspace(JSON.stringify({
      schema: "baskent-3b-workspace",
      version: 1,
      exportedAt: new Date().toISOString(),
      applicationVersion: "8.0.0",
      preferences: {
        basemap: "<script>",
        theme: "dark",
        performance: "ultra",
        favorites: ["safe", "<bad>"],
        layerVisibility: { safe: true, "<bad>": true },
        layerOpacity: { safe: 2 }
      }
    }));
    expect(parsed.preferences.basemap).toBe("hybrid");
    expect(parsed.preferences.theme).toBe("light");
    expect(parsed.preferences.favorites).toEqual(["safe"]);
    expect(parsed.preferences.layerOpacity.safe).toBe(1);
  });
});
