import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyTucbsVerificationFailure,
  clearTucbsBrowserVerificationCache,
  describeTucbsVerificationFailure,
  enrichTucbsVerificationReport,
  selectVerifiedTucbsEndpoints,
  verifyTucbsBrowserAccess
} from "../src/lib/tucbsBrowserVerification";

const WMS_URL = "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wms/demo/test";
const WFS_URL = "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wfs/demo/test";
const WMS_130 = '<?xml version="1.0"?><WMS_Capabilities version="1.3.0"><Capability><Layer><MinScaleDenominator>2500</MinScaleDenominator><MaxScaleDenominator>400000</MaxScaleDenominator></Layer></Capability></WMS_Capabilities>';
const WMS_111 = '<?xml version="1.0"?><WMT_MS_Capabilities version="1.1.1"><Capability><Layer><MinScaleDenominator>5000</MinScaleDenominator><MaxScaleDenominator>200000</MaxScaleDenominator></Layer></Capability></WMT_MS_Capabilities>';

afterEach(() => {
  clearTucbsBrowserVerificationCache();
  vi.unstubAllGlobals();
});

describe("TUCBS browser verification coordinator", () => {
  it("classifies approved-IP/auth rejection without exposing an endpoint", () => {
    expect(classifyTucbsVerificationFailure("HTTP 403")).toMatchObject({
      failureCode: "access-denied",
      retryable: false
    });

    const report = enrichTucbsVerificationReport({
      total: 1,
      verified: 0,
      failed: 1,
      results: [{ key: "tucbs.dogalgaz-hatti.wms", ok: false, reason: "HTTP 403" }],
      scaleProfiles: {}
    });
    const message = describeTucbsVerificationFailure(report);
    expect(message).toContain("dış IP");
    expect(message).not.toContain(WMS_URL);
  });

  it("deduplicates concurrent verification and briefly caches successful browser proof", async () => {
    const fetchMock = vi.fn(async () => new Response(WMS_130, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const endpoints = { "tucbs.dogalgaz-hatti.wms": WMS_URL };

    const [first, second] = await Promise.all([
      verifyTucbsBrowserAccess(endpoints, { successCacheTtlMs: 60_000 }),
      verifyTucbsBrowserAccess(endpoints, { successCacheTtlMs: 60_000 })
    ]);
    const third = await verifyTucbsBrowserAccess(endpoints, { successCacheTtlMs: 60_000 });

    expect(first.verified).toBe(1);
    expect(second.verified).toBe(1);
    expect(third.verified).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry access-denied endpoints with a legacy capability version", async () => {
    const fetchMock = vi.fn(async () => new Response("Forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const report = await verifyTucbsBrowserAccess(
      { "tucbs.dogalgaz-hatti.wms": WMS_URL },
      { bypassCache: true, timeoutMs: 3_000 }
    );

    expect(report.verified).toBe(0);
    expect(report.results[0]).toMatchObject({ failureCode: "access-denied", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back from WMS 1.3.0 to 1.1.1 only for capability compatibility failures", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("VERSION=1.1.1")) return new Response(WMS_111, { status: 200 });
      return new Response('<?xml version="1.0"?><ServiceExceptionReport><ServiceException>Version negotiation failed</ServiceException></ServiceExceptionReport>', { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await verifyTucbsBrowserAccess(
      { "tucbs.dogalgaz-hatti.wms": WMS_URL },
      { bypassCache: true, timeoutMs: 3_000 }
    );

    expect(report).toMatchObject({ total: 1, verified: 1, failed: 0 });
    expect(report.results[0]).toMatchObject({
      ok: true,
      capabilityVersion: "1.1.1",
      compatibilityFallback: true,
      minScale: 200000,
      maxScale: 5000
    });
    expect(report.scaleProfiles["tucbs.dogalgaz-hatti.wms"]).toMatchObject({
      minScale: 200000,
      maxScale: 5000
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(report)).not.toContain(WMS_URL);
  });

  it("keeps only verified endpoints when browser access is partial", () => {
    const report = enrichTucbsVerificationReport({
      total: 2,
      verified: 1,
      failed: 1,
      results: [
        { key: "tucbs.dogalgaz-hatti.wms", ok: true },
        { key: "tucbs.dogalgaz-hatti.wfs", ok: false, reason: "HTTP 403" }
      ],
      scaleProfiles: {}
    });

    expect(selectVerifiedTucbsEndpoints({
      "tucbs.dogalgaz-hatti.wms": WMS_URL,
      "tucbs.dogalgaz-hatti.wfs": WFS_URL
    }, report)).toEqual({
      "tucbs.dogalgaz-hatti.wms": WMS_URL
    });
  });

  it("classifies browser-network, timeout, throttling and upstream failures separately", () => {
    expect(classifyTucbsVerificationFailure("Tarayıcıdan ağ erişimi kurulamadı").failureCode).toBe("browser-network");
    expect(classifyTucbsVerificationFailure("Zaman aşımı").failureCode).toBe("timeout");
    expect(classifyTucbsVerificationFailure("HTTP 429").failureCode).toBe("throttled");
    expect(classifyTucbsVerificationFailure("HTTP 503").failureCode).toBe("upstream-error");
  });
});
