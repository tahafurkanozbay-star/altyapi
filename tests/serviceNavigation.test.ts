import { describe, expect, it } from "vitest";
import {
  applyServiceNavigationSnapshot,
  isOperationalScale,
  navigationSourceLabel,
  operationalExtentContains,
  operationalScaleLabel,
  parseServiceNavigationSnapshot,
  recommendedActivationScale
} from "../src/lib/serviceNavigation";
import type { ServiceDefinition, ServiceNavigationSnapshot } from "../src/types";

function service(overrides: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id: "svc-a",
    kind: "MapServer",
    displayName: "Katman A",
    organization: "ABB",
    owner: "ABB",
    url: "https://example.com/MapServer/0",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: "Katman A",
    servisTuruAdi: "MapServer",
    tokenUrl: "https://example.com/MapServer/0",
    ...overrides
  };
}

const snapshot: ServiceNavigationSnapshot = {
  schemaVersion: 1,
  verifiedAt: "2026-09-21T07:20:56.229Z",
  source: "test",
  profiles: [{
    index: 0,
    name: "Katman A",
    kind: "MapServer",
    extent: { xmin: 31, ymin: 39, xmax: 34, ymax: 41, wkid: 4326 },
    minScale: 400000,
    recommendedScale: 300000,
    renderScaleSensitive: true,
    source: "verified-render"
  }]
};

describe("serviceNavigation", () => {
  it("parses and applies a matching navigation profile", () => {
    const parsed = parseServiceNavigationSnapshot(snapshot);
    const [enriched] = applyServiceNavigationSnapshot([service()], parsed);
    expect(enriched?.operationalMinScale).toBe(400000);
    expect(enriched?.recommendedScale).toBe(300000);
    expect(enriched?.renderScaleSensitive).toBe(true);
    expect(enriched?.operationalExtent?.wkid).toBe(4326);
  });

  it("uses ArcGIS scale semantics correctly", () => {
    const enriched = {
      ...service(),
      operationalMinScale: 400000,
      operationalMaxScale: 1000
    };
    expect(isOperationalScale(enriched, 500000)).toBe(false);
    expect(isOperationalScale(enriched, 300000)).toBe(true);
    expect(isOperationalScale(enriched, 500)).toBe(false);
    expect(isOperationalScale(enriched, 1500)).toBe(true);
  });

  it("checks verified extents and formats scale guidance", () => {
    const enriched = {
      ...service(),
      operationalExtent: { xmin: 31, ymin: 39, xmax: 34, ymax: 41, wkid: 4326 as const },
      operationalMinScale: 400000,
      recommendedScale: 300000,
      navigationSource: "verified-render" as const
    };
    expect(operationalExtentContains(enriched, 32.85, 39.92)).toBe(true);
    expect(operationalExtentContains(enriched, 29, 39.92)).toBe(false);
    expect(operationalScaleLabel(enriched)).toMatch(/400/);
    expect(navigationSourceLabel(enriched)).toMatch(/render/i);
    expect(recommendedActivationScale(enriched)).toBe(300000);
  });

  it("derives a safe fallback scale inside a declared range", () => {
    const enriched = {
      ...service(),
      operationalMinScale: 2000000,
      operationalMaxScale: 1000
    };
    const scale = recommendedActivationScale(enriched);
    expect(scale).toBeGreaterThanOrEqual(1000);
    expect(scale).toBeLessThanOrEqual(2000000);
  });
});
