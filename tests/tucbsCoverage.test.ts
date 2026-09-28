import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverTucbsCoverageProfiles,
  extractWmsGeographicExtent,
  missingTucbsCoverageKeys
} from "../src/lib/tucbsCoverage";

const exCapabilities = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0">
  <Capability><Layer>
    <EX_GeographicBoundingBox>
      <westBoundLongitude>30.0</westBoundLongitude>
      <eastBoundLongitude>35.0</eastBoundLongitude>
      <southBoundLatitude>38.0</southBoundLatitude>
      <northBoundLatitude>42.0</northBoundLatitude>
    </EX_GeographicBoundingBox>
    <Layer>
      <Title>DOĞALGAZ HATTI</Title>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>31.6</westBoundLongitude>
        <eastBoundLongitude>33.5</eastBoundLongitude>
        <southBoundLatitude>39.0</southBoundLatitude>
        <northBoundLatitude>40.6</northBoundLatitude>
      </EX_GeographicBoundingBox>
    </Layer>
  </Layer></Capability>
</WMS_Capabilities>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TUCBS WMS coverage discovery", () => {
  it("prefers the most specific valid EX_GeographicBoundingBox", () => {
    expect(extractWmsGeographicExtent(exCapabilities)).toEqual({
      xmin: 31.6,
      ymin: 39,
      xmax: 33.5,
      ymax: 40.6,
      wkid: 4326
    });
  });

  it("supports namespaced geographic bounds and legacy LatLonBoundingBox", () => {
    const namespaced = `<WMS_Capabilities><Layer><EX_GeographicBoundingBox>
      <wms:westBoundLongitude>32.1</wms:westBoundLongitude>
      <wms:eastBoundLongitude>33.2</wms:eastBoundLongitude>
      <wms:southBoundLatitude>39.2</wms:southBoundLatitude>
      <wms:northBoundLatitude>40.1</wms:northBoundLatitude>
    </EX_GeographicBoundingBox></Layer></WMS_Capabilities>`;
    expect(extractWmsGeographicExtent(namespaced)).toEqual({ xmin: 32.1, ymin: 39.2, xmax: 33.2, ymax: 40.1, wkid: 4326 });

    const legacy = `<WMT_MS_Capabilities><Layer><LatLonBoundingBox minx="31.9" miny="39.1" maxx="33.4" maxy="40.4" /></Layer></WMT_MS_Capabilities>`;
    expect(extractWmsGeographicExtent(legacy)).toEqual({ xmin: 31.9, ymin: 39.1, xmax: 33.4, ymax: 40.4, wkid: 4326 });
  });

  it("rejects malformed or impossible geographic envelopes", () => {
    expect(extractWmsGeographicExtent(`<WMS_Capabilities><EX_GeographicBoundingBox>
      <westBoundLongitude>190</westBoundLongitude><eastBoundLongitude>195</eastBoundLongitude>
      <southBoundLatitude>39</southBoundLatitude><northBoundLatitude>40</northBoundLatitude>
    </EX_GeographicBoundingBox></WMS_Capabilities>`)).toBeUndefined();

    expect(extractWmsGeographicExtent(`<WMS_Capabilities><LatLonBoundingBox minx="33" miny="40" maxx="32" maxy="39" /></WMS_Capabilities>`)).toBeUndefined();
  });

  it("learns WMS coverage from the browser and mirrors it to the WFS peer without persisting URLs", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(exCapabilities, { status: 200, headers: { "content-type": "text/xml" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const endpoints = {
      "tucbs.dogalgaz-hatti.wms": "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/example-wms",
      "tucbs.dogalgaz-hatti.wfs": "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/example-wfs"
    };
    const report = await discoverTucbsCoverageProfiles(endpoints, { timeoutMs: 5_000, concurrency: 2 });

    expect(report.total).toBe(1);
    expect(report.discovered).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.profiles["tucbs.dogalgaz-hatti.wms"]?.extent).toEqual({
      xmin: 31.6,
      ymin: 39,
      xmax: 33.5,
      ymax: 40.6,
      wkid: 4326
    });
    expect(report.profiles["tucbs.dogalgaz-hatti.wfs"]?.source).toBe("paired-wms-capabilities");
    expect(JSON.stringify(report.profiles)).not.toContain("ucbp-api.tucbs.gov.tr");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("REQUEST=GetCapabilities");
  });

  it("reports only WMS endpoints that still lack learned coverage", () => {
    const endpoints = {
      "tucbs.dogalgaz-hatti.wms": "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/a",
      "tucbs.dogalgaz-hatti.wfs": "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/b",
      "tucbs.dogalgaz-vana.wms": "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/c"
    };
    const profiles = {
      "tucbs.dogalgaz-hatti.wms": {
        extent: { xmin: 31, ymin: 39, xmax: 34, ymax: 41, wkid: 4326 as const },
        verifiedAt: new Date().toISOString(),
        source: "wms-capabilities" as const
      }
    };

    expect(missingTucbsCoverageKeys(endpoints, profiles)).toEqual(["tucbs.dogalgaz-vana.wms"]);
  });
});
