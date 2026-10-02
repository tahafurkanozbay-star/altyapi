import { describe, expect, it } from "vitest";
import {
  BROWSER_SERVICE_HEALTH_MAX_AGE_MS,
  applyBrowserServiceHealth,
  isBrowserServiceHealthFresh,
  loadBrowserServiceHealthProfiles,
  sanitizeBrowserServiceHealthProfiles,
  saveBrowserServiceHealthProfiles,
  type BrowserServiceHealthProfileMap
} from "../src/lib/browserServiceHealth";
import type { ServiceDefinition } from "../src/types";

function service(overrides: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id: "yagmur-suyu-boru-mapserver-a1b2c3d4",
    kind: "MapServer",
    displayName: "YAĞMUR SUYU BORU",
    organization: "ABB",
    owner: "ABB",
    url: "https://example.com/arcgis/rest/services/altyapi/MapServer/0",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "degraded",
    access: "network-restricted",
    browserCompatible: null,
    failureCount: 0,
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: "YAĞMUR SUYU BORU",
    servisTuruAdi: "MapServer",
    tokenUrl: "https://example.com/arcgis/rest/services/altyapi/MapServer/0",
    ...overrides
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
    dump() { return [...values.values()].join("\n"); }
  };
}

describe("browserServiceHealth", () => {
  it("promotes recent stable browser proof above degraded runner health", () => {
    const now = Date.parse("2026-10-02T04:30:00.000Z");
    const profiles: BrowserServiceHealthProfileMap = {
      [service().id]: { checkedAt: new Date(now - 60_000).toISOString(), renderReadyMs: 840 }
    };
    const [resolved] = applyBrowserServiceHealth([service()], profiles, now);

    expect(resolved?.availability).toBe("verified");
    expect(resolved?.access).toBe("public-browser");
    expect(resolved?.browserCompatible).toBe(true);
    expect(resolved?.verificationStale).toBe(false);
    expect(resolved?.verificationReason).toContain("stabil");
  });

  it("does not let old browser proof override current service health", () => {
    const now = Date.parse("2026-10-02T04:30:00.000Z");
    const stale = { checkedAt: new Date(now - BROWSER_SERVICE_HEALTH_MAX_AGE_MS - 1).toISOString() };
    const [resolved] = applyBrowserServiceHealth([service()], { [service().id]: stale }, now);

    expect(isBrowserServiceHealthFresh(stale, now)).toBe(false);
    expect(resolved?.availability).toBe("degraded");
    expect(resolved?.access).toBe("network-restricted");
  });

  it("never overrides TUCBS approved-IP authorization semantics", () => {
    const now = Date.parse("2026-10-02T04:30:00.000Z");
    const tucbs = service({
      id: "dogalgaz-hatti-wms-a1b2c3d4",
      kind: "WMS",
      servisTuruAdi: "WMS",
      displayName: "DOĞALGAZ HATTI",
      cografiVeriKatmanAdi: "DOĞALGAZ HATTI",
      url: "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/APPROVED/wms/demo/layer",
      tokenUrl: "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/APPROVED/wms/demo/layer",
      tucbsEndpointKey: "tucbs.dogalgaz-hatti.wms",
      availability: "unknown",
      access: "network-restricted"
    });
    const profiles = { [tucbs.id]: { checkedAt: new Date(now).toISOString() } };
    const [resolved] = applyBrowserServiceHealth([tucbs], profiles, now);

    expect(resolved?.availability).toBe("unknown");
    expect(resolved?.access).toBe("network-restricted");
  });

  it("persists only bounded anonymous service health fields", () => {
    const storage = memoryStorage();
    saveBrowserServiceHealthProfiles({
      [service().id]: {
        checkedAt: "2026-10-02T04:30:00.000Z",
        renderReadyMs: 999_999
      }
    }, storage);

    const serialized = storage.dump();
    expect(serialized).toContain(service().id);
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toMatch(/token|password|authorization/i);

    const loaded = loadBrowserServiceHealthProfiles(storage, Date.parse("2026-10-02T05:00:00.000Z"));
    expect(loaded[service().id]?.renderReadyMs).toBe(300_000);
  });

  it("drops malformed IDs, invalid timestamps and unexpected profile fields", () => {
    const sanitized = sanitizeBrowserServiceHealthProfiles({
      "good-service-1": { checkedAt: "2026-10-02T04:30:00.000Z", renderReadyMs: 1250, url: "https://secret.example" },
      "bad service id": { checkedAt: "2026-10-02T04:30:00.000Z" },
      "bad-time": { checkedAt: "not-a-date" }
    });

    expect(Object.keys(sanitized)).toEqual(["good-service-1"]);
    expect(sanitized["good-service-1"]).toEqual({
      checkedAt: "2026-10-02T04:30:00.000Z",
      renderReadyMs: 1250
    });
  });
});
