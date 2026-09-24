import { describe, expect, it } from "vitest";
import {
  applyServiceZoomSnapshot,
  currentZoomFromScale,
  isOperationalZoom,
  parseServiceZoomSnapshot,
  scaleForZoom,
  zoomForScale,
  zoomRangeLabel
} from "../src/lib/serviceZoom";
import type { ServiceDefinition, ServiceZoomSnapshot } from "../src/types";

function service(overrides: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id: "svc",
    kind: "MapServer",
    displayName: "Katman",
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
    cografiVeriKatmanAdi: "Katman",
    servisTuruAdi: "MapServer",
    tokenUrl: "https://example.com/MapServer/0",
    ...overrides
  };
}

const snapshot: ServiceZoomSnapshot = {
  schemaVersion: 1,
  verifiedAt: "2026-09-24T05:06:41.406Z",
  scaleModel: "WebMercator standard LOD",
  profiles: [{
    index: 0,
    name: "Katman",
    kind: "MapServer",
    status: "verified-range",
    source: "multi-zoom-render",
    minZoom: 8,
    maxZoom: 22,
    testedMinZoom: 5,
    testedMaxZoom: 22
  }]
};

describe("serviceZoom", () => {
  it("parses and applies audited hard zoom bounds", () => {
    const parsed = parseServiceZoomSnapshot(snapshot);
    const [enriched] = applyServiceZoomSnapshot([service({ operationalMinScale: 400000 })], parsed);
    expect(enriched?.operationalMinZoom).toBe(8);
    expect(enriched?.operationalMaxZoom).toBe(22);
    expect(enriched?.operationalMinScale).toBe(Math.round(scaleForZoom(8)));
    expect(enriched?.operationalMaxScale).toBe(Math.round(scaleForZoom(22)));
  });

  it("enforces lower and upper zoom boundaries", () => {
    const enriched = service({ operationalMinZoom: 8, operationalMaxZoom: 22 });
    expect(isOperationalZoom(enriched, 7.99)).toBe(false);
    expect(isOperationalZoom(enriched, 8)).toBe(true);
    expect(isOperationalZoom(enriched, 16)).toBe(true);
    expect(isOperationalZoom(enriched, 22)).toBe(true);
    expect(isOperationalZoom(enriched, 22.01)).toBe(false);
  });

  it("keeps WebMercator zoom/scale conversion reversible", () => {
    for (const zoom of [5, 8, 9, 11, 19, 22]) {
      expect(zoomForScale(scaleForZoom(zoom))).toBeCloseTo(zoom, 8);
      expect(currentZoomFromScale(scaleForZoom(zoom))).toBeCloseTo(zoom, 8);
    }
  });

  it("reports no hard limit without inventing a zoom range", () => {
    const noLimit = service({ zoomAuditStatus: "no-hard-limit" });
    expect(zoomRangeLabel(noLimit)).toMatch(/Hard zoom sınırı yok/i);
    expect(isOperationalZoom(noLimit, 2)).toBe(true);
    expect(isOperationalZoom(noLimit, 25)).toBe(true);
  });
});
