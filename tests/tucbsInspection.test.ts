import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTucbsInspectionCache,
  inspectTucbsBrowserServices
} from "../src/lib/tucbsInspection";

const WMS_URL = "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wms/private/value";
const WFS_URL = "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wfs/private/value";
const WMS_XML = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0"><Capability><Layer><Layer>
  <Name>dogalgaz_hatti</Name>
  <MinScaleDenominator>2500</MinScaleDenominator>
  <MaxScaleDenominator>400000</MaxScaleDenominator>
  <EX_GeographicBoundingBox>
    <westBoundLongitude>31.6</westBoundLongitude><eastBoundLongitude>33.5</eastBoundLongitude>
    <southBoundLatitude>39</southBoundLatitude><northBoundLatitude>40.6</northBoundLatitude>
  </EX_GeographicBoundingBox>
</Layer></Layer></Capability></WMS_Capabilities>`;

const WFS_XML = '<?xml version="1.0"?><WFS_Capabilities version="2.0.0"></WFS_Capabilities>';

afterEach(() => {
  clearTucbsInspectionCache();
  vi.unstubAllGlobals();
});

describe("single-pass TUCBS browser inspection", () => {
  it("uses one request per endpoint while learning access, scale and coverage together", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(url.includes("SERVICE=WFS") ? WFS_XML : WMS_XML, {
        status: 200,
        headers: { "content-type": "application/xml" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await inspectTucbsBrowserServices({
      "tucbs.dogalgaz-hatti.wms": WMS_URL,
      "tucbs.dogalgaz-hatti.wfs": WFS_URL
    }, { timeoutMs: 3_000, concurrency: 2, bypassCache: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({ total: 2, verified: 2, failed: 0 });
    expect(report.scaleProfiles["tucbs.dogalgaz-hatti.wms"]).toMatchObject({
      minScale: 400000,
      maxScale: 2500,
      source: "wms-capabilities"
    });
    expect(report.scaleProfiles["tucbs.dogalgaz-hatti.wfs"]?.source).toBe("paired-wms-capabilities");
    expect(report.coverageProfiles["tucbs.dogalgaz-hatti.wms"]?.extent).toEqual({
      xmin: 31.6,
      ymin: 39,
      xmax: 33.5,
      ymax: 40.6,
      wkid: 4326
    });
    expect(report.coverageProfiles["tucbs.dogalgaz-hatti.wfs"]?.source).toBe("paired-wms-capabilities");
    expect(JSON.stringify(report)).not.toContain(WMS_URL);
    expect(JSON.stringify(report)).not.toContain(WFS_URL);
  });

  it("deduplicates concurrent verification of the same protected endpoint set", async () => {
    const fetchMock = vi.fn(async () => new Response(WMS_XML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const endpoints = { "tucbs.dogalgaz-hatti.wms": WMS_URL };

    const [left, right] = await Promise.all([
      inspectTucbsBrowserServices(endpoints),
      inspectTucbsBrowserServices(endpoints)
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(left).toEqual(right);
  });

  it("tries the legacy WMS version only for capability compatibility failures", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("VERSION=1.3.0")) return new Response("bad format", { status: 200 });
      return new Response('<WMT_MS_Capabilities version="1.1.1"></WMT_MS_Capabilities>', { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await inspectTucbsBrowserServices(
      { "tucbs.dogalgaz-hatti.wms": WMS_URL },
      { bypassCache: true }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(report.results[0]).toMatchObject({
      ok: true,
      capabilityVersion: "1.1.1",
      compatibilityFallback: true
    });
  });

  it("does not retry legacy capabilities after an authorization rejection", async () => {
    const fetchMock = vi.fn(async () => new Response("Forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const report = await inspectTucbsBrowserServices(
      { "tucbs.dogalgaz-hatti.wms": WMS_URL },
      { bypassCache: true }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report.results[0]).toMatchObject({ ok: false, failureCode: "access-denied", retryable: false });
  });
});
