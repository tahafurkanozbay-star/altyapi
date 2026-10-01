import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v42 typed OGC worker architecture", () => {
  it("keeps network credentials out of the dedicated parsing worker", async () => {
    const worker = await readFile("src/workers/ogcCapabilities.worker.ts", "utf8");
    const client = await readFile("src/platform/ogcCapabilitiesWorker.ts", "utf8");

    expect(worker).toContain("DedicatedWorkerGlobalScope");
    expect(worker).toContain("inspectOgcCapabilities");
    expect(worker).not.toContain("fetch(");
    expect(worker).not.toContain("new URL(");
    expect(worker).not.toContain("ucbp-api.tucbs.gov.tr");
    expect(client).toContain('new Worker(new URL("../workers/ogcCapabilities.worker.ts"');
    expect(client).toContain("inspectOgcCapabilities(xml, kind)");
    expect(client).toContain("WORKER_TIMEOUT_MS");
  });

  it("uses one inspection pipeline for TUCBS access plus catalog migration", async () => {
    const setup = await readFile("src/components/TucbsAccessSetup.tsx", "utf8");
    const catalog = await readFile("src/lib/catalog.ts", "utf8");
    const inspection = await readFile("src/lib/tucbsInspection.ts", "utf8");

    expect(setup).toContain("inspectTucbsBrowserServices as verifyTucbsEndpoints");
    expect(setup).not.toContain("discoverTucbsCoverageProfiles");
    expect(catalog).toContain("inspectTucbsBrowserServices");
    expect(catalog).not.toContain("discoverTucbsCoverageProfiles");
    expect(inspection).toContain("readResponseTextLimited");
    expect(inspection).toContain("MAX_CAPABILITIES_BYTES");
    expect(inspection).toContain("inspectionInFlight");
  });

  it("typechecks DOM, service-worker and dedicated-worker worlds independently", async () => {
    const appConfig = await readFile("tsconfig.app.json", "utf8");
    const workerConfig = await readFile("tsconfig.worker.json", "utf8");
    const packageJson = await readFile("package.json", "utf8");

    expect(appConfig).toContain('"src/workers"');
    expect(workerConfig).toContain('"WebWorker"');
    expect(workerConfig).toContain('"strict": true');
    expect(packageJson).toContain("tsc -p tsconfig.worker.json");
  });
});
