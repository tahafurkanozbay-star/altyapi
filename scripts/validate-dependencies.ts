import { readFile } from "node:fs/promises";

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
};

const manifest = JSON.parse(await readFile("package.json", "utf8")) as PackageManifest;
const dependencies = manifest.dependencies ?? {};
const devDependencies = manifest.devDependencies ?? {};
const errors: string[] = [];

const arcgisCore = dependencies["@arcgis/core"];
const arcgisComponents = dependencies["@arcgis/map-components"];
if (!isExactStableVersion(arcgisCore)) {
  errors.push("@arcgis/core tam ve stabil bir sürüme sabitlenmelidir.");
}
if (!isExactStableVersion(arcgisComponents)) {
  errors.push("@arcgis/map-components tam ve stabil bir sürüme sabitlenmelidir.");
}
if (arcgisCore !== arcgisComponents) {
  errors.push("@arcgis/core ile @arcgis/map-components aynı sürümde olmalıdır.");
}

const react = stableVersion(dependencies.react);
const reactDom = stableVersion(dependencies["react-dom"]);
if (!react || !reactDom || react !== reactDom) {
  errors.push("react ve react-dom aynı stabil sürüm ailesinde olmalıdır.");
}

for (const [name, version] of Object.entries({ ...dependencies, ...devDependencies })) {
  if (/(?:^|[-.])(alpha|beta|canary|dev|next|nightly|rc)(?:[.-]|$)/i.test(version)) {
    errors.push(`${name} prerelease sürüm kullanıyor: ${version}`);
  }
  if (/^(?:git\+|https?:|file:|github:)/i.test(version)) {
    errors.push(`${name} yeniden üretilebilir registry sürümü yerine doğrudan kaynak kullanıyor: ${version}`);
  }
}

if (majorOf(devDependencies.typescript) < 7) {
  errors.push("TypeScript 7 veya daha yeni bir stabil sürüm gereklidir.");
}
if (majorOf(devDependencies.vite) < 8) {
  errors.push("Vite 8 veya daha yeni bir stabil sürüm gereklidir.");
}
if (!/(?:^|\s)>=\s*22(?:\.|\s|$)/.test(manifest.engines?.node ?? "")) {
  errors.push("Node engine en az 22 olmalıdır.");
}

if (errors.length > 0) {
  console.error("Bağımlılık doğrulaması başarısız:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(`✓ Bağımlılık zinciri uyumlu: ArcGIS ${arcgisCore}, React ${react}, TypeScript ${stableVersion(devDependencies.typescript)}, Vite ${stableVersion(devDependencies.vite)}.`);

function isExactStableVersion(value: string | undefined): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
}

function stableVersion(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/\d+\.\d+\.\d+/);
  return match?.[0];
}

function majorOf(value: string | undefined): number {
  const version = stableVersion(value);
  if (!version) return 0;
  return Number(version.split(".", 1)[0]) || 0;
}
