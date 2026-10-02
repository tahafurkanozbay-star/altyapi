import { describe, expect, it } from "vitest";
import { applyServiceHealthSnapshot } from "../src/lib/serviceHealth";
import type { ServiceDefinition, ServiceHealthSnapshot } from "../src/types";

function service(): ServiceDefinition {
  return {
    id: "icme-suyu-boru-mapserver-a1b2c3d4",
    kind: "MapServer",
    displayName: "İÇME SUYU BORU",
    organization: "ABB",
    owner: "ABB",
    url: "https://example.com/arcgis/rest/services/water/MapServer/0",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: "İÇME SUYU BORU",
    servisTuruAdi: "MapServer",
    tokenUrl: "https://example.com/arcgis/rest/services/water/MapServer/0"
  };
}

describe("v46 stale runner health neutrality", () => {
  it("keeps stale runner outcomes as provenance without poisoning scheduler health", () => {
    const now = Date.parse("2026-10-02T05:00:00.000Z");
    const snapshot: ServiceHealthSnapshot = {
      schemaVersion: 1,
      generatedAt: "2026-09-24T08:32:00.000Z",
      source: "public runner",
      services: [{
        index: 0,
        name: "İÇME SUYU BORU",
        kind: "MapServer",
        availability: "degraded",
        access: "network-restricted",
        browserCompatible: null,
        reason: "Public runner timeout"
      }]
    };

    const [resolved] = applyServiceHealthSnapshot([service()], snapshot, now);
    expect(resolved?.availability).toBe("unknown");
    expect(resolved?.access).toBe("unknown");
    expect(resolved?.verificationStale).toBe(true);
    expect(resolved?.verificationReason).toBe("Public runner timeout");
  });
});
