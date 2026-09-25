import { afterEach, describe, expect, it, vi } from "vitest";
import {
  endpointKeyFor,
  extractWmsScaleProfile,
  parseTucbsEndpointImport,
  resolveTucbsRuntimeUrl,
  runtimeEndpointKeyFromUrl,
  runtimeTucbsUrl,
  sanitizeTucbsUrl,
  verifyTucbsEndpoints
} from "../src/lib/tucbsAccess";

const TEST_DIRECT_URL = "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wms/demo/test";
const TEST_WFS_URL = "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wfs/demo/test";

const WMS_CAPABILITIES = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0">
  <Capability>
    <Layer>
      <Layer>
        <Name>dogalgaz_hatti</Name>
        <MinScaleDenominator>2500</MinScaleDenominator>
        <MaxScaleDenominator>400000</MaxScaleDenominator>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

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

  it("converts WMS denominator semantics into ArcGIS zoom limits", () => {
    const profile = extractWmsScaleProfile(WMS_CAPABILITIES);
    expect(profile).toMatchObject({ minScale: 400000, maxScale: 2500 });
    expect(profile?.recommendedScale).toBeGreaterThan(2500);
    expect(profile?.recommendedScale).toBeLessThan(400000);
  });

  it("verifies capabilities from the browser and learns scale profiles without exposing signed URLs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("SERVICE=WFS")) {
        return new Response('<?xml version="1.0"?><WFS_Capabilities version="2.0.0"></WFS_Capabilities>', {
          status: 200,
          headers: { "content-type": "application/xml" }
        });
      }
      return new Response(WMS_CAPABILITIES, { status: 200, headers: { "content-type": "application/xml" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await verifyTucbsEndpoints({
      "tucbs.dogalgaz-hatti.wms": TEST_DIRECT_URL,
      "tucbs.dogalgaz-hatti.wfs": TEST_WFS_URL
    }, { timeoutMs: 3_000 });

    expect(report).toMatchObject({ total: 2, verified: 2, failed: 0 });
    expect(report.results.find((item) => item.key.endsWith(".wms"))).toMatchObject({
      ok: true,
      minScale: 400000,
      maxScale: 2500
    });
    expect(report.scaleProfiles["tucbs.dogalgaz-hatti.wms"]).toMatchObject({
      minScale: 400000,
      maxScale: 2500,
      source: "wms-capabilities"
    });
    expect(report.scaleProfiles["tucbs.dogalgaz-hatti.wfs"]).toMatchObject({
      minScale: 400000,
      maxScale: 2500,
      source: "paired-wms-capabilities"
    });
    expect(JSON.stringify(report)).not.toContain(TEST_DIRECT_URL);
    expect(JSON.stringify(report)).not.toContain(TEST_WFS_URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not invent a zoom restriction when the provider declares none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      '<?xml version="1.0"?><WMS_Capabilities version="1.3.0"></WMS_Capabilities>',
      { status: 200, headers: { "content-type": "application/xml" } }
    )));
    const report = await verifyTucbsEndpoints({ "tucbs.dogalgaz-hatti.wms": TEST_DIRECT_URL }, { timeoutMs: 3_000 });
    expect(report.verified).toBe(1);
    expect(report.scaleProfiles).toEqual({});
  });

  it("reports authorization failure without echoing the protected endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    const report = await verifyTucbsEndpoints({ "tucbs.dogalgaz-hatti.wms": TEST_DIRECT_URL }, { timeoutMs: 3_000 });
    expect(report.verified).toBe(0);
    expect(report.results[0]).toMatchObject({ ok: false, reason: "HTTP 403" });
    expect(JSON.stringify(report)).not.toContain(TEST_DIRECT_URL);
  });
});
