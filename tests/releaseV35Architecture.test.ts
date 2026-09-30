import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("health-aware load admission release coherence", () => {
  it("keeps release/cache generation aligned and health weighting in the scheduler", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    const sw = await readFile("public/sw.js", "utf8");
    const scheduler = await readFile("src/gis/layerLoadScheduler.ts", "utf8");
    const major = packageJson.version.split(".", 1)[0];

    expect(major).toMatch(/^\d+$/);
    expect(sw).toContain(`altyapi-shell-v${major}`);
    expect(sw).toContain(`altyapi-data-v${major}`);
    expect(scheduler).toContain("loadHealthRank");
    expect(scheduler).toContain("loadCostFor");
    expect(scheduler).toContain("activeCost");
    expect(scheduler).toContain("verificationStale");
    expect(scheduler).toContain("PRIORITY.restore");
    expect(scheduler).toContain("networkConcurrencyCap");
    expect(scheduler).toContain("cancelTrackedLayerLoad");
  });
});
