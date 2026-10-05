import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER_EXPLORER_STATE,
  parseLayerExplorerState
} from "../src/lib/layerExplorerState";

describe("layerExplorerState", () => {
  it("falls back safely for invalid persisted values", () => {
    expect(parseLayerExplorerState(null)).toEqual(DEFAULT_LAYER_EXPLORER_STATE);

    const state = parseLayerExplorerState({
      query: "x".repeat(300),
      kind: "NotAServiceKind",
      availability: "unsafe",
      activeOnly: true,
      favoriteOnly: "yes",
      collapsedGroups: ["ABB", "ABB", 7, "TUCBS"]
    });

    expect(state.query).toHaveLength(160);
    expect(state.kind).toBe("all");
    expect(state.availability).toBe("all");
    expect(state.activeOnly).toBe(true);
    expect(state.favoriteOnly).toBe(false);
    expect(state.collapsedGroups).toEqual(["ABB", "TUCBS"]);
  });

  it("retains valid citizen explorer preferences", () => {
    expect(parseLayerExplorerState({
      query: "doğalgaz",
      kind: "WMS",
      availability: "verified",
      activeOnly: false,
      favoriteOnly: true,
      collapsedGroups: ["Ankara Büyükşehir Belediyesi"]
    })).toEqual({
      query: "doğalgaz",
      kind: "WMS",
      availability: "verified",
      activeOnly: false,
      favoriteOnly: true,
      collapsedGroups: ["Ankara Büyükşehir Belediyesi"]
    });
  });
});
