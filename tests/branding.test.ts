import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Ankara Kent Rehberi branding", () => {
  it("uses a complete bundled Ankara PNG for all visible brand marks", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const css = await readFile("src/styles/ankara-brand.css", "utf8");
    const logo = await readFile("src/assets/ankara-logo.png");

    expect(entry).toContain('import "./styles/ankara-brand.css"');
    expect(css).toContain('.brand-symbol');
    expect(css).toContain('.tool-rail-mark');
    expect(css).toContain('.boot-logo');
    expect(css).toContain('url("../assets/ankara-logo.png")');
    expect(logo.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(logo.subarray(-12)).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
    expect(logo.byteLength).toBeGreaterThan(4_000);
  });
});
