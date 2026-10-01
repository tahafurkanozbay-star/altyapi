import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("TypeScript service worker", () => {
  it("keeps the authored worker in strict TypeScript and emits the deployable JS", async () => {
    const source = await readFile("src/sw/sw.ts", "utf8");
    const emitted = await readFile("public/sw.js", "utf8");
    const packageJson = await readFile("package.json", "utf8");
    const typecheckConfig = await readFile("tsconfig.sw.json", "utf8");
    const buildConfig = await readFile("tsconfig.sw.build.json", "utf8");

    expect(source).toContain("ServiceWorkerGlobalScope");
    expect(source).toContain('const SHELL_CACHE = "altyapi-shell-v41"');
    expect(source).toContain("isWorkerMessage");
    expect(source).toContain("isCacheable");
    expect(source).not.toContain(": any");

    expect(emitted).toContain("GENERATED OUTPUT");
    expect(emitted).toContain('const SHELL_CACHE = "altyapi-shell-v41"');
    expect(emitted).toContain('const DATA_CACHE = "altyapi-data-v41"');

    expect(packageJson).toContain('"build:sw"');
    expect(packageJson).toContain("tsconfig.sw.build.json");
    expect(packageJson).toContain("tsconfig.sw.json");
    expect(typecheckConfig).toContain('"WebWorker"');
    expect(typecheckConfig).toContain('"strict": true');
    expect(buildConfig).toContain('"outDir": "public"');
  });
});
