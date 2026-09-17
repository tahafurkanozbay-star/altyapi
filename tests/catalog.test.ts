import { describe, expect, it } from "vitest";
import { inferKind, normalizeService, parseServicesDocument, serviceMatches, slugify } from "../src/lib/catalog";

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
