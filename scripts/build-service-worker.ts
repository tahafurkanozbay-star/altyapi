import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { transformWithEsbuild } from "vite";

const SOURCE = resolve("worker/sw.ts");
const OUTPUT = resolve("public/sw.js");
const PLACEHOLDER = "__ALTYAPI_RELEASE__";

const [packageText, sourceText] = await Promise.all([
  readFile(resolve("package.json"), "utf8"),
  readFile(SOURCE, "utf8")
]);

const packageJson = JSON.parse(packageText) as { version?: unknown };
const release = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
if (!/^\d+\.\d+\.\d+$/.test(release)) {
  throw new Error(`Service worker üretimi için geçerli semver sürümü gerekli: ${String(packageJson.version)}`);
}
if (!sourceText.includes(PLACEHOLDER)) {
  throw new Error(`Service worker kaynak dosyasında ${PLACEHOLDER} bulunamadı.`);
}

const injectedSource = sourceText.replaceAll(PLACEHOLDER, release);
const transformed = await transformWithEsbuild(injectedSource, SOURCE, {
  loader: "ts",
  target: "es2023",
  format: "iife",
  minify: false,
  sourcemap: false
});

await mkdir(dirname(OUTPUT), { recursive: true });
const banner = `/* AUTO-GENERATED from worker/sw.ts for release ${release}. Do not edit public/sw.js directly. */\n`;
await writeFile(OUTPUT, banner + transformed.code, "utf8");
console.log(`✓ Service Worker üretildi: ${release}`);
