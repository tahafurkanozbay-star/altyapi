import { describe, expect, it } from "vitest";
import { featureLayerVisualStyle, parseMapServerUrl } from "../src/gis/layerFactory";

describe("ArcGIS ESM layer factory", () => {
  it("separates a MapServer sublayer id from the service root", () => {
    expect(parseMapServerUrl("https://example.test/arcgis/rest/services/water/MapServer/7")).toEqual({
      root: "https://example.test/arcgis/rest/services/water/MapServer",
      sublayerId: 7
    });
  });

  it("keeps MapServer roots intact", () => {
    expect(parseMapServerUrl("https://example.test/arcgis/rest/services/water/MapServer")).toEqual({
      root: "https://example.test/arcgis/rest/services/water/MapServer",
      sublayerId: undefined
    });
  });

  it("does not rewrite non-MapServer URLs", () => {
    const url = "https://example.test/arcgis/rest/services/boundaries/FeatureServer/0";
    expect(parseMapServerUrl(url)).toEqual({ root: url });
  });

  it("renders SINIRLAR as vivid pink outline with no polygon fill", () => {
    expect(featureLayerVisualStyle({ kind: "FeatureServer", displayName: "SINIRLAR" })).toEqual({
      fillStyle: "none",
      fillColor: [255, 0, 168, 0],
      outlineColor: [255, 0, 168, 1],
      outlineWidth: 2.75
    });
  });

  it("does not override other feature-layer symbology", () => {
    expect(featureLayerVisualStyle({ kind: "FeatureServer", displayName: "3D1234 WFL1" })).toBeUndefined();
    expect(featureLayerVisualStyle({ kind: "MapServer", displayName: "SINIRLAR" })).toBeUndefined();
  });
});
