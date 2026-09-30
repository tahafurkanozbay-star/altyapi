import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { shouldRunPublicServiceWarmup } from "../src/lib/serviceWarmup";

describe("v37 coordinated service warmup", () => {
  it("does not admit background warmup on offline, save-data or 2G clients", () => {
    expect(shouldRunPublicServiceWarmup({ onLine: false })).toBe(false);
    expect(shouldRunPublicServiceWarmup({ onLine: true, connection: { saveData: true } })).toBe(false);
    expect(shouldRunPublicServiceWarmup({ onLine: true, connection: { effectiveType: "2g" } })).toBe(false);
    expect(shouldRunPublicServiceWarmup({ onLine: true, connection: { effectiveType: "4g" } })).toBe(true);
  });

  it("coordinates tabs and propagates page lifecycle cancellation", async () => {
    const source = await readFile("src/lib/serviceWarmup.ts", "utf8");

    expect(source).toContain('WARMUP_LOCK_NAME = "altyapi:public-service-warmup"');
    expect(source).toContain("lockManager.request(");
    expect(source).toContain("ifAvailable: true");
    expect(source).toContain('window.addEventListener("pagehide"');
    expect(source).toContain('document.visibilityState === "hidden"');
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("parentSignal.addEventListener(\"abort\"");
  });
});
