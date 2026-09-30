import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("typed Service Worker pipeline", () => {
  it("authors the worker in strict TypeScript and generates the browser artifact", async () => {
    const [source, generator, generated, packageText, rootTsconfig] = await Promise.all([
      readFile("worker/service-worker.ts", "utf8"),
      readFile("scripts/generate-service-worker.ts", "utf8"),
      readFile("public/sw.js", "utf8"),
      readFile("package.json", "utf8"),
      readFile("tsconfig.json", "utf8")
    ]);

    expect(source).toContain("ServiceWorkerGlobalScope");
    expect(source).toContain("FetchEvent");
    expect(source).toContain("ExtendableMessageEvent");
    expect(source).toContain("__ALTYAPI_RELEASE__");
    expect(generator).toContain("ts.transpileModule");
    expect(generator).toContain('writeFile("public/sw.js"');
    expect(generated).toMatch(/^\/\* AUTO-GENERATED from worker\/service-worker\.ts\. DO NOT EDIT\. \*\//);
    expect(generated).not.toContain("__ALTYAPI_RELEASE__");
    expect(packageText).toContain('"generate:sw"');
    expect(rootTsconfig).toContain("tsconfig.worker.json");
    expect(rootTsconfig).toContain("tsconfig.tools.json");
  });

  it("bounds offline caches and applies network deadlines without caching live data as shell", async () => {
    const [source, generated] = await Promise.all([
      readFile("worker/service-worker.ts", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);

    for (const text of [source, generated]) {
      expect(text).toContain("SHELL_MAX_ENTRIES");
      expect(text).toContain("DATA_MAX_ENTRIES");
      expect(text).toContain("DATA_TIMEOUT_MS");
      expect(text).toContain("NAVIGATION_TIMEOUT_MS");
      expect(text).toContain("trimCache");
      expect(text).toContain("fetchWithTimeout");
      expect(text).toContain('cache: "no-store"');
    }
  });
});
