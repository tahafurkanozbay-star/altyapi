import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v46 browser health installation", () => {
  it("installs browser health memory before the ArcGIS LayerView watchdog", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const memory = entry.indexOf("installBrowserServiceHealthMemory();");
    const watchdog = entry.indexOf("installSceneLayerWatchdog();");

    expect(entry).toContain('import { installBrowserServiceHealthMemory } from "./lib/browserServiceHealth"');
    expect(memory).toBeGreaterThan(-1);
    expect(watchdog).toBeGreaterThan(memory);
  });
});
