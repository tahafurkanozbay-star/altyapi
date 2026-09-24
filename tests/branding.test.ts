import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Ankara Kent Rehberi branding", () => {
  it("uses the bundled Ankara logo for all visible brand marks", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const css = await readFile("src/styles/ankara-brand.css", "utf8");
    const logo = await readFile("src/assets/ankara-logo.png");

    expect(entry).toContain('import "./styles/ankara-brand.css"');
    expect(css).toContain('.brand-symbol');
    expect(css).toContain('.tool-rail-mark');
    expect(css).toContain('.boot-logo');
    expect(css).toContain('url("../assets/ankara-logo.png")');
    expect(logo.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(logo.byteLength).toBeGreaterThan(1_000);
  });
});
