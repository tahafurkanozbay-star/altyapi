import { describe, expect, it } from "vitest";
import {
  isSafePublicArcGisWarmupUrl,
  selectPublicServiceWarmupCandidates,
  serviceWarmupBudget
} from "../src/lib/serviceWarmup";

const publicMap = (name: string, url: string) => ({
  cografiVeriKatmanAdi: name,
  servisTuruAdi: "MapServer",
  tokenUrl: url
});

const health = (index: number, latencyMs: number, overrides: Record<string, unknown> = {}) => ({
  index,
  kind: "MapServer",
  availability: "verified",
  access: "public-browser",
  browserCompatible: true,
  latencyMs,
  ...overrides
});

describe("public ArcGIS cold-start warmup", () => {
  it("selects only slow verified public ArcGIS services and orders slowest first", () => {
    const catalog = {
      services: [
        publicMap("slow-a", "https://example.com/arcgis/rest/services/a/MapServer"),
        publicMap("fast", "https://example.com/arcgis/rest/services/b/MapServer"),
        publicMap("slow-b", "https://example.com/arcgis/rest/services/c/MapServer"),
        publicMap("blocked", "https://example.com/arcgis/rest/services/d/MapServer")
      ]
    };
    const snapshot = {
      services: [
        health(0, 3_800),
        health(1, 300),
        health(2, 4_200),
        health(3, 5_000, { access: "browser-blocked", browserCompatible: false })
      ]
    };

    const candidates = selectPublicServiceWarmupCandidates(catalog, snapshot, "high");
    expect(candidates.map((candidate) => candidate.index)).toEqual([2, 0]);
    expect(candidates.every((candidate) => candidate.latencyMs >= 1_500)).toBe(true);
  });

  it("never warms TUCBS runtime/direct endpoints or credential-bearing URLs", () => {
    const catalog = {
      services: [
        publicMap("runtime", "https://ucbp-api.tucbs.gov.tr/__runtime__/dogalgaz/MapServer"),
        publicMap("direct", "https://ucbp-api.tucbs.gov.tr/authorized/MapServer"),
        publicMap("token", "https://example.com/arcgis/rest/services/a/MapServer?token=secret"),
        publicMap("safe", "https://example.com/arcgis/rest/services/b/MapServer")
      ]
    };
    const snapshot = { services: [health(0, 9_000), health(1, 9_000), health(2, 9_000), health(3, 2_000)] };

    expect(selectPublicServiceWarmupCandidates(catalog, snapshot, "high").map((candidate) => candidate.index)).toEqual([3]);
    expect(isSafePublicArcGisWarmupUrl("https://example.com/a/MapServer?api_key=x")).toBe(false);
    expect(isSafePublicArcGisWarmupUrl("http://example.com/a/MapServer")).toBe(false);
    expect(isSafePublicArcGisWarmupUrl("https://example.com/a/MapServer")).toBe(true);
  });

  it("keeps background network pressure bounded by performance profile", () => {
    expect(serviceWarmupBudget("eco")).toEqual({ maxCandidates: 1, concurrency: 1 });
    expect(serviceWarmupBudget("balanced")).toEqual({ maxCandidates: 3, concurrency: 1 });
    expect(serviceWarmupBudget("high")).toEqual({ maxCandidates: 4, concurrency: 2 });
  });
});
