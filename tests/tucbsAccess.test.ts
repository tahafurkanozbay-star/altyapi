import { afterEach, describe, expect, it, vi } from "vitest";
import {
  endpointKeyFor,
  parseTucbsEndpointImport,
  resolveTucbsRuntimeUrl,
  runtimeEndpointKeyFromUrl,
  runtimeTucbsUrl,
  sanitizeTucbsUrl,
  verifyTucbsEndpoints
} from "../src/lib/tucbsAccess";

const TEST_DIRECT_URL = "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wms/demo/test";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TUCBS approved-IP endpoint resolution", () => {
  it("maps known layer names and protocols to stable local endpoint keys", () => {
    expect(endpointKeyFor("DOĞALGAZ HATTI", "WMS")).toBe("tucbs.dogalgaz-hatti.wms");
    expect(endpointKeyFor("DOĞALGAZ HATTI", "WFS")).toBe("tucbs.dogalgaz-hatti.wfs");
  });

  it("round-trips safe public runtime sentinels", () => {
    const key = "tucbs.dogalgaz-hatti.wms";
    const sentinel = runtimeTucbsUrl(key);
    expect(sentinel).toBe("https://ucbp-api.tucbs.gov.tr/__runtime__/tucbs.dogalgaz-hatti.wms");
    expect(runtimeEndpointKeyFromUrl(sentinel)).toBe(key);
  });

  it("imports authorized service JSON without changing the signed URL", () => {
    const imported = parseTucbsEndpointImport(JSON.stringify({
      services: [{
        cografiVeriKatmanAdi: "DOĞALGAZ HATTI",
        servisTuruAdi: "WMS",
        tokenUrl: TEST_DIRECT_URL
      }]
    }));

    expect(imported["tucbs.dogalgaz-hatti.wms"]).toBe(TEST_DIRECT_URL);
  });

  it("resolves a public sentinel only when the browser has a matching local endpoint", () => {
    const sentinel = runtimeTucbsUrl("tucbs.dogalgaz-hatti.wms");
    expect(resolveTucbsRuntimeUrl(sentinel, {})).toBe(sentinel);
    expect(resolveTucbsRuntimeUrl(sentinel, { "tucbs.dogalgaz-hatti.wms": TEST_DIRECT_URL })).toBe(TEST_DIRECT_URL);
  });

  it("rejects service URLs outside the official TUCBS host and spatial path", () => {
    expect(() => sanitizeTucbsUrl("https://example.com/geoservice/spatial/TEST/wms/demo/test")).toThrow(/ucbp-api\.tucbs\.gov\.tr/);
    expect(() => sanitizeTucbsUrl("https://ucbp-api.tucbs.gov.tr/other/path")).toThrow(/geoservice\/spatial/);
  });

  it("verifies capabilities from the browser while keeping signed URLs out of diagnostics", async () => {
    const fetchMock = vi.fn(async () => new Response(
      '<?xml version="1.0"?><WMS_Capabilities version="1.3.0"></WMS_Capabilities>',
      { status: 200, headers: { "content-type": "application/xml" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const report = await verifyTucbsEndpoints({ "tucbs.dogalgaz-hatti.wms": TEST_DIRECT_URL }, { timeoutMs: 3_000 });
    expect(report).toMatchObject({ total: 1, verified: 1, failed: 0 });
    expect(report.results[0]).toMatchObject({ key: "tucbs.dogalgaz-hatti.wms", ok: true });
    expect(JSON.stringify(report)).not.toContain(TEST_DIRECT_URL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports authorization failure without echoing the protected endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    const report = await verifyTucbsEndpoints({ "tucbs.dogalgaz-hatti.wms": TEST_DIRECT_URL }, { timeoutMs: 3_000 });
    expect(report.verified).toBe(0);
    expect(report.results[0]).toMatchObject({ ok: false, reason: "HTTP 403" });
    expect(JSON.stringify(report)).not.toContain(TEST_DIRECT_URL);
  });
});
