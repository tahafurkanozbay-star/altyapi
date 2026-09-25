import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type RawService = {
  cografiVeriKatmanAdi: string;
  servisTuruAdi: string;
  tokenUrl: string;
};

type NavigationProfile = {
  index: number;
  name: string;
  kind: string;
  minScale?: number;
  maxScale?: number;
  recommendedScale?: number;
};

describe("20-layer zoom policy matrix", () => {
  it("keeps every catalogue row accounted for", async () => {
    const catalog = JSON.parse(await readFile("public/services.json", "utf8")) as { services: RawService[] };
    expect(catalog.services).toHaveLength(20);
    expect(catalog.services.slice(0, 10).every((service) => /ucbp-api\.tucbs\.gov\.tr\/__runtime__\//i.test(service.tokenUrl))).toBe(true);
  });

  it("locks the six scale-sensitive ABB infrastructure services to their verified range", async () => {
    const navigation = JSON.parse(await readFile("public/service-navigation.json", "utf8")) as { profiles: NavigationProfile[] };
    const byIndex = new Map(navigation.profiles.map((profile) => [profile.index, profile]));

    for (const index of [10, 11, 12, 13, 14, 15]) {
      expect(byIndex.get(index)).toMatchObject({
        index,
        minScale: 400000,
        recommendedScale: 300000
      });
    }
  });

  it("uses the provider-declared UIP interval and does not invent limits for unrestricted public layers", async () => {
    const navigation = JSON.parse(await readFile("public/service-navigation.json", "utf8")) as { profiles: NavigationProfile[] };
    const byIndex = new Map(navigation.profiles.map((profile) => [profile.index, profile]));

    expect(byIndex.get(16)).toMatchObject({
      minScale: 2311162,
      maxScale: 1128,
      recommendedScale: 1800000
    });

    for (const index of [17, 18, 19]) {
      expect(byIndex.get(index)?.minScale).toBeUndefined();
      expect(byIndex.get(index)?.maxScale).toBeUndefined();
    }
  });

  it("requires every TUCBS logical dataset to expose both WMS and WFS so WMS scale metadata can guard either transport", async () => {
    const catalog = JSON.parse(await readFile("public/services.json", "utf8")) as { services: RawService[] };
    const tucbs = catalog.services.slice(0, 10);
    const groups = new Map<string, Set<string>>();
    for (const service of tucbs) {
      const kinds = groups.get(service.cografiVeriKatmanAdi) ?? new Set<string>();
      kinds.add(service.servisTuruAdi);
      groups.set(service.cografiVeriKatmanAdi, kinds);
    }

    expect(groups.size).toBe(5);
    for (const kinds of groups.values()) expect([...kinds].sort()).toEqual(["WFS", "WMS"]);
  });
});
