import { describe, expect, it } from "vitest";
import { parseServicesDocument } from "../src/lib/catalog";
import { parseServiceHealthSnapshot } from "../src/lib/serviceHealth";
import { parseServiceNavigationSnapshot } from "../src/lib/serviceNavigation";

describe("runtime boundary validation", () => {
  it("constructs service definitions only from validated required strings", () => {
    expect(parseServicesDocument({
      services: [{
        ustKurumAdi: " ABB ",
        metaveriSahibiKurumAdi: "ASKİ",
        cografiVeriKatmanAdi: "İçme Suyu",
        servisTuruAdi: "MapServer",
        tokenUrl: "https://example.test/MapServer"
      }]
    })).toEqual([{
      ustKurumAdi: "ABB",
      metaveriSahibiKurumAdi: "ASKİ",
      cografiVeriKatmanAdi: "İçme Suyu",
      servisTuruAdi: "MapServer",
      tokenUrl: "https://example.test/MapServer"
    }]);

    expect(() => parseServicesDocument({ services: [{ ustKurumAdi: "ABB" }] })).toThrow(/eksik veya geçersiz/);
  });

  it("drops health entries with unsupported service kinds instead of casting them", () => {
    const snapshot = parseServiceHealthSnapshot({
      schemaVersion: 1,
      generatedAt: "2026-10-01T00:00:00.000Z",
      source: "test",
      services: [
        { index: 0, name: "Ok", kind: "WMS", availability: "verified", access: "public-browser" },
        { index: 1, name: "Bad", kind: "SQL", availability: "verified", access: "public-browser" }
      ]
    });
    expect(snapshot.services).toHaveLength(1);
    expect(snapshot.services[0]?.kind).toBe("WMS");
  });

  it("drops navigation profiles with unsupported kinds and non-numeric scales", () => {
    const snapshot = parseServiceNavigationSnapshot({
      schemaVersion: 1,
      verifiedAt: "2026-10-01T00:00:00.000Z",
      source: "test",
      profiles: [
        {
          index: 0,
          name: "Ok",
          kind: "FeatureServer",
          source: "verified-render",
          extent: { xmin: 32, ymin: 39, xmax: 33, ymax: 40, wkid: 4326 },
          minScale: "400000"
        },
        {
          index: 1,
          name: "Bad",
          kind: "UnknownServer",
          source: "verified-render",
          extent: { xmin: 32, ymin: 39, xmax: 33, ymax: 40, wkid: 4326 }
        }
      ]
    });
    expect(snapshot.profiles).toHaveLength(1);
    expect(snapshot.profiles[0]?.minScale).toBeUndefined();
  });
});
