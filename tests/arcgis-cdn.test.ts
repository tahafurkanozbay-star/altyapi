import { afterEach, describe, expect, it } from "vitest";
import { ArcGISRuntime } from "../src/gis/ArcGISRuntime";
import { createLayer } from "../src/gis/layerFactory";
import type { ServiceDefinition } from "../src/types";

const originalArcgis = Object.getOwnPropertyDescriptor(globalThis, "$arcgis");

afterEach(() => {
  if (originalArcgis) Object.defineProperty(globalThis, "$arcgis", originalArcgis);
  else delete (globalThis as Record<string, unknown>).$arcgis;
});

describe("ArcGIS CDN module loading", () => {
  it("uses $arcgis.import return values directly for config, Map and SceneView", async () => {
    const config = { request: { timeout: 62_000 } };
    let mapCreated = false;
    let sceneCreated = false;

    class MapMock {
      constructor(_properties: Record<string, unknown>) {
        mapCreated = true;
      }
    }

    class SceneViewMock {
      camera = { position: { longitude: 32, latitude: 39, z: 5000 }, heading: 0, tilt: 45 };
      scale = 1;

      constructor(_properties: Record<string, unknown>) {
        sceneCreated = true;
      }

      async when() {}
      on() { return { remove() {} }; }
      watch() { return { remove() {} }; }
    }

    installArcgisImport(async (moduleId) => {
      if (moduleId === "@arcgis/core/Map.js") return MapMock;
      if (moduleId === "@arcgis/core/views/SceneView.js") return SceneViewMock;
      if (moduleId === "@arcgis/core/config.js") return config;
      throw new Error(`Beklenmeyen modül: ${moduleId}`);
    });

    const runtime = new ArcGISRuntime("balanced");
    await runtime.initialize({} as HTMLDivElement);

    expect(mapCreated).toBe(true);
    expect(sceneCreated).toBe(true);
    expect(config.request.timeout).toBe(30_000);
  });

  it("uses the directly returned layer constructor instead of .default", async () => {
    class FeatureLayerMock {
      properties: Record<string, unknown>;
      constructor(properties: Record<string, unknown>) {
        this.properties = properties;
      }
    }

    installArcgisImport(async (moduleId) => {
      expect(moduleId).toBe("@arcgis/core/layers/FeatureLayer.js");
      return FeatureLayerMock;
    });

    const service: ServiceDefinition = {
      ustKurumAdi: "ABB",
      metaveriSahibiKurumAdi: "CBS",
      cografiVeriKatmanAdi: "Test",
      servisTuruAdi: "FeatureServer",
      tokenUrl: "https://example.test/FeatureServer/0",
      id: "test-layer",
      kind: "FeatureServer",
      displayName: "Test",
      organization: "ABB",
      owner: "CBS",
      url: "https://example.test/FeatureServer/0",
      status: "idle",
      visible: true,
      opacity: 1,
      favorite: false
    };

    const layer = await createLayer(service) as FeatureLayerMock;
    expect(layer).toBeInstanceOf(FeatureLayerMock);
    expect(layer.properties).toMatchObject({ id: "svc-test-layer", url: service.url, visible: true });
  });
});

function installArcgisImport(loader: (moduleId: string) => Promise<unknown>): void {
  Object.defineProperty(globalThis, "$arcgis", {
    configurable: true,
    value: { import: loader }
  });
}
