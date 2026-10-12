import { describe, expect, it } from "vitest";
import { chooseStartupLayers } from "../src/lib/startupLayers";
import { normalizeService } from "../src/lib/catalog";
import type { ServiceKind } from "../src/types";

function service(name: string, kind: ServiceKind, index: number) {
  return { ...normalizeService({
    ustKurumAdi: "ABB", metaveriSahibiKurumAdi: "ABB", cografiVeriKatmanAdi: name,
    servisTuruAdi: kind, tokenUrl: `https://example.org/${kind}/${index}`
  }, index), availability: "verified" as const, access: "public-browser" as const };
}
const catalog = [service("3B Binalar", "SceneServer", 0), service("SINIRLAR", "FeatureServer", 1)];

describe("lightweight startup", () => {
  it("opens boundaries and leaves expensive scene data off in a fresh session", () => {
    const restored = chooseStartupLayers(catalog, false);
    expect(restored.filter((item) => item.visible).map((item) => item.displayName)).toEqual(["SINIRLAR"]);
    expect(catalog.every((item) => !item.visible)).toBe(true);
  });
  it("honors an explicit empty shared or saved view", () => {
    expect(chooseStartupLayers(catalog, true).some((item) => item.visible)).toBe(false);
  });
  it("keeps an explicit heavy-layer restoration", () => {
    const restored = chooseStartupLayers([{ ...catalog[0]!, visible: true }, catalog[1]!], false);
    expect(restored[0]?.visible).toBe(true);
    expect(restored[1]?.visible).toBe(false);
  });
  it("never replaces missing or unavailable boundaries with heavy 3B data", () => {
    expect(chooseStartupLayers([catalog[0]!], false).some((item) => item.visible)).toBe(false);
    expect(chooseStartupLayers(catalog.map((item) => ({ ...item, availability: "unavailable" })), false).some((item) => item.visible)).toBe(false);
  });
});
