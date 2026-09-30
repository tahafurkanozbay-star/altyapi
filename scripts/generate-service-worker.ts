import { readFile, writeFile } from "node:fs/promises";
import * as ts from "typescript";

type PackageManifest = { version?: string };

const [packageText, source] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("worker/service-worker.ts", "utf8")
]);
const manifest = JSON.parse(packageText) as PackageManifest;
const major = releaseMajor(manifest.version);
const prepared = source.replaceAll("__ALTYAPI_RELEASE__", String(major));

if (prepared.includes("__ALTYAPI_RELEASE__")) {
  throw new Error("Service Worker release placeholder çözümlenemedi.");
}

const transpiled = ts.transpileModule(prepared, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    removeComments: false,
    newLine: ts.NewLineKind.LineFeed
  },
  fileName: "worker/service-worker.ts",
  reportDiagnostics: true
});

const diagnostics = transpiled.diagnostics ?? [];
const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (errors.length > 0) {
  const host: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n"
  };
  throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, host));
}

const banner = "/* AUTO-GENERATED from worker/service-worker.ts. DO NOT EDIT. */\n";
await writeFile("public/sw.js", `${banner}${transpiled.outputText.trimEnd()}\n`, "utf8");
console.log(`✓ Typed Service Worker üretildi: v${major}.`);

function releaseMajor(version: string | undefined): number {
  const major = Number(version?.split(".")[0]);
  if (!Number.isInteger(major) || major <= 0) {
    throw new Error(`Geçersiz package release sürümü: ${version ?? "(yok)"}`);
  }
  return major;
}
