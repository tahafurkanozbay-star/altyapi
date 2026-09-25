import { describe, expect, it } from "vitest";
import { ogcLayerMatchScore, parseMapServerUrl } from "../src/gis/layerFactory";
import {
  buildVisibilityRenderer,
  classifyServiceVisual,
  normalizeGeometryType,
  serviceVisualProfile
} from "../src/gis/layerVisuals";

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

  it("assigns a distinct vivid semantic palette to utility families", () => {
    expect(classifyServiceVisual({ displayName: "DOĞALGAZ HATTI" })).toBe("natural-gas");
    expect(classifyServiceVisual({ displayName: "YAĞMUR SUYU BORU" })).toBe("stormwater");
    expect(classifyServiceVisual({ displayName: "PİS SU BORU" })).toBe("wastewater");
    expect(classifyServiceVisual({ displayName: "İÇME SUYU BORU" })).toBe("drinking-water");

    const gas = serviceVisualProfile({ displayName: "DOĞALGAZ HATTI" });
    const drinking = serviceVisualProfile({ displayName: "İÇME SUYU BORU" });
    expect(gas.color).not.toEqual(drinking.color);
    expect(gas.lineWidth).toBeGreaterThanOrEqual(4);
    expect(drinking.lineWidth).toBeGreaterThanOrEqual(4);
  });

  it("keeps boundaries fill-free and visibly thick", () => {
    const profile = serviceVisualProfile({ displayName: "SINIRLAR" });
    const renderer = buildVisibilityRenderer(profile, "esriGeometryPolygon");
    expect(profile.category).toBe("boundary");
    expect(profile.lineWidth).toBeGreaterThanOrEqual(3.5);
    expect(renderer).toMatchObject({
      type: "simple",
      symbol: {
        type: "simple-fill",
        style: "none"
      }
    });
  });

  it("builds geometry-aware line and point renderers", () => {
    const profile = serviceVisualProfile({ displayName: "YAĞMUR SUYU ELEMAN" });
    expect(normalizeGeometryType("esriGeometryPolyline")).toBe("polyline");
    expect(normalizeGeometryType("point")).toBe("point");
    expect(buildVisibilityRenderer(profile, "polyline")).toMatchObject({
      symbol: { type: "simple-line", width: profile.lineWidth }
    });
    expect(buildVisibilityRenderer(profile, "point")).toMatchObject({
      symbol: { type: "simple-marker", size: profile.markerSize }
    });
  });

  it("matches OGC WMS sublayers using Turkish-normalized catalogue names", () => {
    expect(ogcLayerMatchScore("DOĞALGAZ DAĞITIM İSTASYONU", {
      title: "Doğalgaz Dağıtım İstasyonu",
      name: "epdk:dogalgaz_dagitim_istasyonu"
    })).toBe(100);
    expect(ogcLayerMatchScore("DOĞALGAZ VANA", {
      title: "Doğalgaz Hattı",
      name: "epdk:dogalgaz_hatti"
    })).toBeLessThan(70);
  });
});
