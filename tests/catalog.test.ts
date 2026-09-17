import { describe, expect, it } from "vitest";
import { inferKind, normalizeService, slugify } from "../src/services/catalog";

const base = {
  ustKurumAdi: "ANKARA BÜYÜKŞEHİR BELEDİYESİ",
  metaveriSahibiKurumAdi: "ANKARA BÜYÜKŞEHİR BELEDİYESİ",
  cografiVeriKatmanAdi: "İÇME SUYU BORU",
  servisTuruAdi: "FeatureServer",
  tokenUrl: "https://example.com/rest/services/Water/FeatureServer/0"
};

describe("catalog helpers", () => {
  it("creates stable Turkish-safe slugs", () => {
    expect(slugify("İÇME SUYU BORU")).toBe("icme-suyu-boru");
  });

  it("uses declared service kind", () => {
    expect(inferKind(base)).toBe("FeatureServer");
  });

  it("normalizes runtime defaults", () => {
    const normalized = normalizeService(base, 0);
    expect(normalized.id).toContain("icme-suyu-boru-featureserver-1");
    expect(normalized.visible).toBe(false);
    expect(normalized.status).toBe("idle");
  });
});
