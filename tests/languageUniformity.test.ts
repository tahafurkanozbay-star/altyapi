import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const CODE_ROOTS = ["src", "scripts", "tests"] as const;
const ALLOWED_SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".png", ".svg", ".d.ts"]);

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

describe("first-party language policy", () => {
  it("keeps application, engineering scripts and tests on TypeScript/TSX", async () => {
    const files = (await Promise.all(CODE_ROOTS.map(walk))).flat();
    const disallowed = files.filter((file) => {
      if (file.endsWith(".d.ts")) return false;
      return !ALLOWED_SOURCE_EXTENSIONS.has(extname(file));
    });

    expect(disallowed).toEqual([]);
    expect(files.some((file) => file.endsWith(".mjs"))).toBe(false);
    expect(files.some((file) => file.endsWith(".cjs"))).toBe(false);
    expect(files.some((file) => file.endsWith(".js"))).toBe(false);
  });

  it("allows JavaScript only as the generated browser service-worker artifact", async () => {
    const publicFiles = await walk("public");
    const publicJavaScript = publicFiles.filter((file) => extname(file) === ".js").sort();
    const generatedWorker = await readFile("public/sw.js", "utf8");
    const workerSource = await readFile("src/sw/sw.ts", "utf8");

    expect(publicJavaScript).toEqual([join("public", "sw.js")]);
    expect(generatedWorker).toContain("GENERATED OUTPUT");
    expect(workerSource).toContain("strict TypeScript file is the source of truth");
  });
});
