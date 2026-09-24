import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function verifyPng(buffer: Buffer): { width: number; height: number; idatBytes: number } {
  expect(buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawIhdr = false;
  let sawIend = false;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    expect(offset + 12).toBeLessThanOrEqual(buffer.length);
    const length = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    expect(chunkEnd).toBeLessThanOrEqual(buffer.length);

    const type = buffer.subarray(offset + 4, offset + 8);
    const typeName = type.toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const storedCrc = buffer.readUInt32BE(offset + 8 + length);
    const calculatedCrc = crc32(Buffer.concat([type, data]));
    expect(calculatedCrc, `PNG ${typeName} chunk CRC mismatch`).toBe(storedCrc);

    if (typeName === "IHDR") {
      expect(sawIhdr).toBe(false);
      expect(length).toBe(13);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      sawIhdr = true;
    } else if (typeName === "IDAT") {
      idatChunks.push(data);
    } else if (typeName === "IEND") {
      expect(length).toBe(0);
      sawIend = true;
      offset = chunkEnd;
      break;
    }

    offset = chunkEnd;
  }

  expect(sawIhdr).toBe(true);
  expect(sawIend).toBe(true);
  expect(offset).toBe(buffer.length);
  expect(idatChunks.length).toBeGreaterThan(0);

  const compressed = Buffer.concat(idatChunks);
  const inflated = inflateSync(compressed);
  expect(inflated.byteLength).toBeGreaterThan(width * height);

  return { width, height, idatBytes: compressed.byteLength };
}

describe("Ankara Kent Rehberi branding", () => {
  it("uses a fully decodable bundled Ankara PNG for all visible brand marks", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const css = await readFile("src/styles/ankara-brand.css", "utf8");
    const logo = await readFile("src/assets/ankara-logo.png");

    expect(entry).toContain('import "./styles/ankara-brand.css"');
    expect(css).toContain(".brand-symbol");
    expect(css).toContain(".tool-rail-mark");
    expect(css).toContain(".boot-logo");
    expect(css).toContain('url("../assets/ankara-logo.png")');

    const png = verifyPng(logo);
    expect(logo.byteLength).toBeGreaterThan(3_500);
    expect(png.width).toBe(175);
    expect(png.height).toBe(293);
    expect(png.idatBytes).toBeGreaterThan(1_000);
  });
});
