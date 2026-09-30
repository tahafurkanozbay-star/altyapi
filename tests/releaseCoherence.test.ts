import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("release coherence", () => {
  it("generates the service worker from strict TypeScript using the package release", async () => {
    const [packageText, workerSource, generator, generatedWorker] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("worker/sw.ts", "utf8"),
      readFile("scripts/build-service-worker.ts", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);

    const packageJson = JSON.parse(packageText) as { version?: string; scripts?: Record<string, string> };
    const release = packageJson.version;
    expect(release).toMatch(/^\d+\.\d+\.\d+$/);
    expect(workerSource).toContain('__ALTYAPI_RELEASE__');
    expect(generator).toContain('replaceAll(PLACEHOLDER, release)');
    expect(generator).toContain('public/sw.js');
    expect(packageJson.scripts?.["build:sw"]).toContain("scripts/build-service-worker.ts");
    expect(packageJson.scripts?.pretest).toContain("npm run build:sw");
    expect(generatedWorker).toContain(`release ${release}`);
    expect(generatedWorker).toContain(`const RELEASE = "${release}"`);
    expect(generatedWorker).toContain('const SHELL_CACHE = "altyapi-shell-v" + RELEASE');
    expect(generatedWorker).toContain('const DATA_CACHE = "altyapi-data-v" + RELEASE');
    expect(generatedWorker).toContain('const RUNTIME_CACHE = "altyapi-runtime-v" + RELEASE');
    expect(generatedWorker).not.toContain("__ALTYAPI_RELEASE__");
  });

  it("keeps live service/navigation data network-first and refuses credential-bearing cache writes", async () => {
    const worker = await readFile("worker/sw.ts", "utf8");

    expect(worker).toContain('pathname.endsWith("services.json")');
    expect(worker).toContain('pathname.endsWith("service-health.json")');
    expect(worker).toContain('pathname.endsWith("service-navigation.json")');
    expect(worker).toContain("networkFirstData(request)");
    expect(worker).toContain('cache: "no-store"');
    expect(worker).toContain("SENSITIVE_QUERY_KEYS");
    expect(worker).toContain('request.headers.has("authorization")');
    expect(worker).toContain("no-store|private");
    expect(worker).toContain("RUNTIME_CACHE");
  });

  it("keeps boot and service-worker client logic in TypeScript instead of inline HTML scripts", async () => {
    const [html, boot, client, packageText] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("src/boot.ts", "utf8"),
      readFile("src/platform/serviceWorkerClient.ts", "utf8"),
      readFile("package.json", "utf8")
    ]);

    expect(html).toContain('src="/src/boot.ts"');
    expect(html).toContain('src="/src/main.tsx"');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i);
    expect(boot).toContain("BOOT_TIMEOUT_MS");
    expect(boot).not.toContain("innerHTML");
    expect(client).toContain("updateViaCache: \"none\"");
    expect(client).toContain("visibilitychange");
    expect(packageText).toContain('"validate:source"');
    expect(packageText).toContain('"typecheck:worker"');
  });
});
