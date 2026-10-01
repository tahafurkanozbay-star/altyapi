import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v39 release coherence", () => {
  it("keeps package and PWA cache generation aligned", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version?: string };
    const worker = await readFile("public/sw.js", "utf8");
    const scheduler = await readFile("src/gis/layerLoadScheduler.ts", "utf8");

    expect(packageJson.version).toBe("39.0.0");
    expect(worker).toContain('altyapi-shell-v39');
    expect(worker).toContain('altyapi-data-v39');
    expect(scheduler).toContain("agedPriority");
    expect(scheduler).toContain("isHalfOpenProbeCandidate");
    expect(scheduler).toContain("admissionCost");
  });
});
