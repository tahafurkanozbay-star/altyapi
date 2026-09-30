import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

type PackageManifest = { version?: string };

const execFileAsync = promisify(execFile);
const outputDirectory = join("node_modules", ".tmp", "service-worker-build");
const outputFile = join(outputDirectory, "service-worker.js");
const packageText = await readFile("package.json", "utf8");
const manifest = JSON.parse(packageText) as PackageManifest;
const major = releaseMajor(manifest.version);

await rm(outputDirectory, { recursive: true, force: true });
await execFileAsync("tsc", [
  "--ignoreConfig",
  "worker/service-worker.ts",
  "--target", "ES2023",
  "--module", "esnext",
  "--lib", "ES2023,WebWorker",
  "--strict",
  "--noUncheckedIndexedAccess",
  "--noFallthroughCasesInSwitch",
  "--skipLibCheck",
  "--outDir", outputDirectory,
  "--pretty", "false"
]);

const emitted = await readFile(outputFile, "utf8");
if (/^\s*(?:import|export)\b/m.test(emitted)) {
  throw new Error("Service Worker classic registration için modül sözdizimi üretildi.");
}
const prepared = emitted.replaceAll("__ALTYAPI_RELEASE__", String(major));
if (prepared.includes("__ALTYAPI_RELEASE__")) {
  throw new Error("Service Worker release placeholder çözümlenemedi.");
}

const banner = "/* AUTO-GENERATED from worker/service-worker.ts. DO NOT EDIT. */\n";
await writeFile("public/sw.js", `${banner}${prepared.trimEnd()}\n`, "utf8");
await rm(outputDirectory, { recursive: true, force: true });
console.log(`✓ Typed Service Worker tsc ile üretildi: v${major}.`);

function releaseMajor(version: string | undefined): number {
  const major = Number(version?.split(".")[0]);
  if (!Number.isInteger(major) || major <= 0) {
    throw new Error(`Geçersiz package release sürümü: ${version ?? "(yok)"}`);
  }
  return major;
}
