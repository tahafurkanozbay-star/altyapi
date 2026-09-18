import { describe, expect, it } from "vitest";
import { createWorkspaceSnapshot, parseWorkspaceSnapshot } from "../src/lib/workspace";

const camera = { longitude: 32.85, latitude: 39.92, z: 5200, heading: 2, tilt: 58 };

describe("workspace snapshots", () => {
  it("creates a portable sanitized snapshot", () => {
    const snapshot = createWorkspaceSnapshot({
      applicationVersion: "8.0.0",
      camera,
      basemap: "hybrid",
      layerVisibility: { "layer-a": true },
      layerOpacity: { "layer-a": 2 },
      favorites: ["layer-a"],
      bookmarks: []
    });
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.layerOpacity["layer-a"]).toBe(1);
  });

  it("drops unknown service ids on import", () => {
    const parsed = parseWorkspaceSnapshot({
      schemaVersion: 1,
      application: "Başkent 3B CBS",
      applicationVersion: "8.0.0",
      exportedAt: "2026-09-18T10:00:00.000Z",
      camera,
      basemap: "hybrid",
      layerVisibility: { "layer-a": true, evil: true },
      layerOpacity: { "layer-a": .5, evil: .9 },
      favorites: ["layer-a", "evil"],
      bookmarks: []
    }, new Set(["layer-a"]));

    expect(parsed.layerVisibility).toEqual({ "layer-a": true });
    expect(parsed.layerOpacity).toEqual({ "layer-a": .5 });
    expect(parsed.favorites).toEqual(["layer-a"]);
  });

  it("rejects foreign formats", () => {
    expect(() => parseWorkspaceSnapshot({ schemaVersion: 2, application: "Other" }, new Set()))
      .toThrow(/desteklenmeyen/i);
  });
});
