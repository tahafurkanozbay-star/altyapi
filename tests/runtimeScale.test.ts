import { describe, expect, it } from "vitest";
import { reconcileServiceRuntimeScale, runtimeScaleRangeFromLoadedLayer } from "../src/lib/runtimeScale";
import type { ServiceDefinition } from "../src/types";

function service(overrides: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id: "runtime-scale-test",
    kind: "MapServer",
    displayName: "Test Katmanı",
    organization: "ABB",
    owner: "ABB",
    url: "https://example.com/MapServer/0",
    tokenUrl: "https://example.com/MapServer/0",
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: "Test Katmanı",
    servisTuruAdi: "MapServer",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    ...overrides
  };
}

describe("runtimeScale", () => {
  it("reads direct loaded-layer scale declarations", () => {
    expect(runtimeScaleRangeFromLoadedLayer({ minScale: 250000, maxScale: 1200 })).toEqual({
      minScale: 250000,
      maxScale: 1200,
      source: "layer-metadata"
    });
  });

  it("falls back to a single MapImage sublayer declaration", () => {
    expect(runtimeScaleRangeFromLoadedLayer({
      minScale: 0,
      maxScale: 0,
      sublayers: { toArray: () => [{ minScale: 180000, maxScale: 2500 }] }
    })).toEqual({ minScale: 180000, maxScale: 2500, source: "map-sublayer-metadata" });
  });

  it("does not invent one range for a multi-sublayer thematic root", () => {
    expect(runtimeScaleRangeFromLoadedLayer({
      sublayers: { toArray: () => [{ minScale: 100000 }, { minScale: 500000 }] }
    })).toBeUndefined();
  });

  it("intersects live provider metadata with a stricter verified profile", () => {
    const reconciled = reconcileServiceRuntimeScale(
      service({ operationalMinScale: 400000, recommendedScale: 300000 }),
      { minScale: 600000, maxScale: 1500, source: "layer-metadata" }
    );
    expect(reconciled.operationalMinScale).toBe(400000);
    expect(reconciled.operationalMaxScale).toBe(1500);
    expect(reconciled.recommendedScale).toBe(300000);
  });

  it("tightens a stale catalogue range when live metadata is stricter", () => {
    const reconciled = reconcileServiceRuntimeScale(
      service({ operationalMinScale: 800000, operationalMaxScale: 500 }),
      { minScale: 300000, maxScale: 2000, source: "layer-metadata" }
    );
    expect(reconciled.operationalMinScale).toBe(300000);
    expect(reconciled.operationalMaxScale).toBe(2000);
    expect(reconciled.recommendedScale).toBeGreaterThanOrEqual(2000);
    expect(reconciled.recommendedScale).toBeLessThanOrEqual(300000);
  });

  it("ignores contradictory remote metadata instead of poisoning a valid profile", () => {
    const original = service({ operationalMinScale: 400000, operationalMaxScale: 1000, recommendedScale: 300000 });
    const reconciled = reconcileServiceRuntimeScale(
      original,
      { minScale: 5000, maxScale: 10000, source: "layer-metadata" }
    );
    expect(reconciled).toBe(original);
  });
});
