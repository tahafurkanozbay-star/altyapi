import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("release coherence", () => {
  it("keeps package major version and service worker cache generation aligned", async () => {
    const [packageText, serviceWorker] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);

    const packageJson = JSON.parse(packageText) as { version?: string };
    const major = Number(packageJson.version?.split(".")[0]);

    expect(Number.isInteger(major)).toBe(true);
    expect(major).toBeGreaterThan(0);
    expect(serviceWorker).toContain(`const SHELL_CACHE = "altyapi-shell-v${major}"`);
    expect(serviceWorker).toContain(`const DATA_CACHE = "altyapi-data-v${major}"`);
  });

  it("keeps live service and navigation data on network-first cache handling", async () => {
    const serviceWorker = await readFile("public/sw.js", "utf8");

    expect(serviceWorker).toContain('url.pathname.endsWith("services.json")');
    expect(serviceWorker).toContain('url.pathname.endsWith("service-health.json")');
    expect(serviceWorker).toContain('url.pathname.endsWith("service-navigation.json")');
    expect(serviceWorker).toContain("event.respondWith(networkFirstData(request))");
    expect(serviceWorker).toContain('fetch(request, { cache: "no-store" })');
  });
});
