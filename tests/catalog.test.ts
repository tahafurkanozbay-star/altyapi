import { describe, expect, it } from "vitest";
import {
  attachSemanticAlternates,
  inferKind,
  normalizeService,
  parseServicesDocument,
  serviceMatches,
  slugify
} from "../src/lib/catalog";

const sample = {
  ustKurumAdi: "ANKARA BÜYÜKŞEHİR BELEDİYESİ",
  metaveriSahibiKurumAdi: "CBS",
  cografiVeriKatmanAdi: "İÇME SUYU BORU",
  servisTuruAdi: "FeatureServer",
  tokenUrl: "https://example.test/rest/services/water/FeatureServer/0"
};

describe("catalog", () => {
  it("Türkçe metni kararlı slug'a dönüştürür", () => {
    expect(slugify("İÇME SUYU / ŞEBEKE ı")).toBe("icme-suyu-sebeke-i");
  });

  it("servis türünü URL'den çıkarabilir", () => {
    expect(inferKind({ ...sample, servisTuruAdi: "bilinmiyor" })).toBe("FeatureServer");
  });

  it("normalize edilen servis aranabilir ve tam görünürlükle başlar", () => {
    const service = normalizeService(sample, 0);
    expect(service.kind).toBe("FeatureServer");
    expect(service.opacity).toBe(1);
    expect(serviceMatches(service, "içme")).toBe(true);
    expect(serviceMatches(service, "mapserver")).toBe(false);
  });

  it("WMS/WFS eşlerini aynı mantıksal veri için karşılıklı failover olarak bağlar", () => {
    const wms = normalizeService({
      ...sample,
      cografiVeriKatmanAdi: "DOĞALGAZ HATTI",
      servisTuruAdi: "WMS",
      tokenUrl: "https://example.test/gas/wms"
    }, 0);
    const wfs = normalizeService({
      ...sample,
      cografiVeriKatmanAdi: "DOĞALGAZ HATTI",
      servisTuruAdi: "WFS",
      tokenUrl: "https://example.test/gas/wfs"
    }, 1);
    const [withWmsAlternate, withWfsAlternate] = attachSemanticAlternates([wms, wfs]);
    expect(withWmsAlternate?.alternateEndpoints).toEqual([
      { kind: "WFS", url: wfs.url, sourceServiceId: wfs.id }
    ]);
    expect(withWfsAlternate?.alternateEndpoints).toEqual([
      { kind: "WMS", url: wms.url, sourceServiceId: wms.id }
    ]);
  });

  it("TUCBS runtime kaydına tarayıcıda öğrenilen sağlayıcı zoom aralığını uygular", () => {
    const runtimeUrl = "https://ucbp-api.tucbs.gov.tr/__runtime__/tucbs.dogalgaz-hatti.wms";
    const directUrl = "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wms/demo/test";
    const service = normalizeService({
      ...sample,
      ustKurumAdi: "ENERJİ VE TABİİ KAYNAKLAR BAKANLIĞI",
      metaveriSahibiKurumAdi: "EPDK",
      cografiVeriKatmanAdi: "DOĞALGAZ HATTI",
      servisTuruAdi: "WMS",
      tokenUrl: runtimeUrl
    }, 0, {
      "tucbs.dogalgaz-hatti.wms": directUrl
    }, {
      "tucbs.dogalgaz-hatti.wms": {
        minScale: 400000,
        maxScale: 2500,
        recommendedScale: 80000,
        verifiedAt: "2026-09-25T06:00:00.000Z",
        source: "wms-capabilities"
      }
    });

    expect(service.url).toBe(directUrl);
    expect(service.operationalMinScale).toBe(400000);
    expect(service.operationalMaxScale).toBe(2500);
    expect(service.recommendedScale).toBe(80000);
    expect(service.renderScaleSensitive).toBe(true);
  });

  it("servis kimliğine query-string içindeki gizli değeri taşımaz", () => {
    const service = normalizeService({ ...sample, tokenUrl: `${sample.tokenUrl}?token=SUPER_SECRET_VALUE` }, 0);
    expect(service.id).not.toContain("super-secret-value");
    expect(service.id).not.toContain("token");
  });

  it("bozuk katalog kayıtlarını erken reddeder", () => {
    expect(() => parseServicesDocument({ services: [{ ...sample, tokenUrl: "" }] })).toThrow(/tokenUrl/);
  });

  it("http/https dışındaki servis protokollerini reddeder", () => {
    expect(() => normalizeService({ ...sample, tokenUrl: "file:///tmp/service" }, 0)).toThrow(/protokol/i);
  });
});
