import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v39 scheduler regression guardrails", () => {
  it("keeps starvation-safe provider scheduling primitives", async () => {
    const scheduler = await readFile("src/gis/layerLoadScheduler.ts", "utf8");

    expect(scheduler).toContain("agedPriority");
    expect(scheduler).toContain("isHalfOpenProbeCandidate");
    expect(scheduler).toContain("admissionCost");
  });
});
