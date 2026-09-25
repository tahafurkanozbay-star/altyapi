import { describe, expect, it, vi } from "vitest";
import {
  classifyServiceError,
  friendlyServiceError,
  serviceRetryDelayMs,
  serviceRuntimePolicy,
  shouldRetryServiceError,
  withRuntimeTimeout
} from "../src/lib/serviceRuntime";

const PUBLIC_MAP = {
  id: "water-mapserver-test",
  kind: "MapServer" as const,
  url: "https://example.test/arcgis/rest/services/water/MapServer/0",
  failureCount: 0,
  verificationLatencyMs: 2_500
};

const TUCBS_WMS = {
  id: "tucbs-gas-wms-test",
  kind: "WMS" as const,
  url: "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wms/demo/test",
  failureCount: 0,
  verificationLatencyMs: undefined,
  alternateEndpoints: [{
    kind: "WFS" as const,
    url: "https://ucbp-api.tucbs.gov.tr/geoservice/spatial/TEST/wfs/demo/test",
    sourceServiceId: "tucbs-gas-wfs-test"
  }]
};

describe("v17 adaptive service runtime", () => {
  it("adapts load timeouts using measured latency", () => {
    const policy = serviceRuntimePolicy(PUBLIC_MAP);
    expect(policy.loadTimeoutMs).toBeGreaterThanOrEqual(30_000);
    expect(policy.loadTimeoutMs).toBeLessThanOrEqual(60_000);
    expect(policy.maxAttempts).toBe(3);
    expect(policy.retryFormatErrors).toBe(false);
  });

  it("gives approved-IP TUCBS OGC services a wider recovery and failover budget", () => {
    const policy = serviceRuntimePolicy(TUCBS_WMS);
    expect(policy.loadTimeoutMs).toBeGreaterThanOrEqual(45_000);
    expect(policy.maxAttempts).toBeGreaterThanOrEqual(3);
    expect(policy.retryFormatErrors).toBe(true);
  });

  it("classifies transient failures separately from auth/configuration failures", () => {
    expect(classifyServiceError(new Error("HTTP 503 Service Unavailable"))).toBe("server");
    expect(classifyServiceError(new Error("Failed to fetch"))).toBe("network");
    expect(classifyServiceError(new Error("Katman yükleme zaman aşımına uğradı"))).toBe("timeout");
    expect(classifyServiceError(new Error("HTTP 403 Forbidden"))).toBe("authorization");
    expect(classifyServiceError(new Error("TUCBS yetkili servis adresi bu tarayıcıda tanımlı değil."))).toBe("configuration");
  });

  it("retries transient and OGC format failures but never hammers authorization/configuration errors", () => {
    const mapPolicy = serviceRuntimePolicy(PUBLIC_MAP);
    const ogcPolicy = serviceRuntimePolicy(TUCBS_WMS);
    expect(shouldRetryServiceError(new Error("HTTP 503"), 1, mapPolicy)).toBe(true);
    expect(shouldRetryServiceError(new Error("Failed to fetch"), 1, mapPolicy)).toBe(true);
    expect(shouldRetryServiceError(new Error("XML capabilities parse error"), 1, mapPolicy)).toBe(false);
    expect(shouldRetryServiceError(new Error("XML capabilities parse error"), 1, ogcPolicy)).toBe(true);
    expect(shouldRetryServiceError(new Error("HTTP 403"), 1, ogcPolicy)).toBe(false);
    expect(shouldRetryServiceError(new Error("TUCBS yetkili servis adresi bu tarayıcıda tanımlı değil."), 1, ogcPolicy)).toBe(false);
    expect(shouldRetryServiceError(new Error("HTTP 503"), mapPolicy.maxAttempts, mapPolicy)).toBe(false);
  });

  it("uses deterministic bounded backoff to avoid synchronized retry storms", () => {
    const policy = serviceRuntimePolicy(PUBLIC_MAP);
    const first = serviceRetryDelayMs(PUBLIC_MAP.id, 1, policy);
    const repeat = serviceRetryDelayMs(PUBLIC_MAP.id, 1, policy);
    const second = serviceRetryDelayMs(PUBLIC_MAP.id, 2, policy);
    expect(first).toBe(repeat);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThanOrEqual(first);
    expect(second).toBeLessThanOrEqual(policy.maxDelayMs);
  });

  it("cancels the underlying operation when a runtime timeout fires", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const pending = new Promise<string>(() => undefined);
    const outcome = withRuntimeTimeout(pending, 5_000, "Katman yükleme", onTimeout);
    const expectation = expect(outcome).rejects.toThrow(/zaman aşımına uğradı/);
    await vi.advanceTimersByTimeAsync(5_000);
    await expectation;
    expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("returns TUCBS-specific guidance without exposing an endpoint", () => {
    const message = friendlyServiceError(TUCBS_WMS, new Error("403 Forbidden"));
    expect(message).toContain("Onaylı dış IP");
    expect(message).not.toContain("https://");
  });
});
