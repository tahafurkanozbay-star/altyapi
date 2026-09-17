import { describe, expect, it } from "vitest";
import { inferKind, normalizeService, serviceMatches, slugify } from "../src/lib/catalog";

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

  it("normalize edilen servis aranabilir", () => {
    const service = normalizeService(sample, 0);
    expect(service.kind).toBe("FeatureServer");
    expect(serviceMatches(service, "içme")).toBe(true);
    expect(serviceMatches(service, "mapserver")).toBe(false);
  });
});
