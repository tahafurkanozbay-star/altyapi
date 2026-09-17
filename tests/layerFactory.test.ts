import { describe, expect, it } from "vitest";
import { parseMapServerUrl } from "../src/gis/layerFactory";

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
});
