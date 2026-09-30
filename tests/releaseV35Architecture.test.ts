import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v35 health-aware load admission", () => {
  it("keeps release/cache generation aligned and health weighting in the scheduler", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    const sw = await readFile("public/sw.js", "utf8");
    const scheduler = await readFile("src/gis/layerLoadScheduler.ts", "utf8");

    expect(packageJson.version).toBe("35.0.0");
    expect(sw).toContain('altyapi-shell-v35');
    expect(sw).toContain('altyapi-data-v35');
    expect(scheduler).toContain("loadHealthRank");
    expect(scheduler).toContain("loadCostFor");
    expect(scheduler).toContain("activeCost");
    expect(scheduler).toContain("verificationStale");
    expect(scheduler).toContain("PRIORITY.restore");
  });
});
