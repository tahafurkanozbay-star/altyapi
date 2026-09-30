import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type TypeScriptApi = typeof import("typescript");
const tsModule = await import("typescript");
const ts = (((tsModule as unknown as { default?: TypeScriptApi }).default) ?? tsModule) as TypeScriptApi;

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
const transpiled = ts.transpileModule(injectedSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.None,
    removeComments: false,
    sourceMap: false,
    inlineSourceMap: false,
    isolatedModules: true
  },
  fileName: SOURCE,
  reportDiagnostics: true
});

const diagnostics = transpiled.diagnostics ?? [];
const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (errors.length > 0) {
  const host: import("typescript").FormatDiagnosticsHost = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n"
  };
  throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, host));
}

await mkdir(dirname(OUTPUT), { recursive: true });
const banner = `/* AUTO-GENERATED from worker/sw.ts for release ${release}. Do not edit public/sw.js directly. */\n`;
await writeFile(OUTPUT, banner + transpiled.outputText, "utf8");
console.log(`✓ Service Worker üretildi: ${release}`);
