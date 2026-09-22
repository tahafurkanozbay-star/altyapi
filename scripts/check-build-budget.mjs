import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const assetsDir = resolve(dist, "assets");
const html = await readFile(resolve(dist, "index.html"), "utf8");

const BUDGETS = {
  largestJsBytes: 1_800_000,
  totalJsBytes: 25_000_000,
  entryJsBytes: 650_000,
  entryCssBytes: 1_000_000
};

const assetNames = await readdir(assetsDir);
const jsAssets = [];
for (const name of assetNames) {
  if (!name.endsWith(".js")) continue;
  const info = await stat(resolve(assetsDir, name));
  jsAssets.push({ name, bytes: info.size });
}

const largestJs = jsAssets.sort((a, b) => b.bytes - a.bytes)[0];
const totalJsBytes = jsAssets.reduce((sum, asset) => sum + asset.bytes, 0);

const moduleScripts = [...html.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter(Boolean);
const cssLinks = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter(Boolean);

const entryJsBytes = await sumReferenced(moduleScripts);
const entryCssBytes = await sumReferenced(cssLinks);

const failures = [];
if ((largestJs?.bytes ?? 0) > BUDGETS.largestJsBytes) {
  failures.push(`En büyük JS chunk bütçeyi aşıyor: ${formatBytes(largestJs.bytes)} > ${formatBytes(BUDGETS.largestJsBytes)} (${largestJs.name})`);
}
if (totalJsBytes > BUDGETS.totalJsBytes) {
  failures.push(`Toplam JS bütçeyi aşıyor: ${formatBytes(totalJsBytes)} > ${formatBytes(BUDGETS.totalJsBytes)}`);
}
if (entryJsBytes > BUDGETS.entryJsBytes) {
  failures.push(`HTML entry JS bütçeyi aşıyor: ${formatBytes(entryJsBytes)} > ${formatBytes(BUDGETS.entryJsBytes)}`);
}
if (entryCssBytes > BUDGETS.entryCssBytes) {
  failures.push(`HTML entry CSS bütçeyi aşıyor: ${formatBytes(entryCssBytes)} > ${formatBytes(BUDGETS.entryCssBytes)}`);
}

console.log(
  `Build budget · largest JS ${formatBytes(largestJs?.bytes ?? 0)} · total JS ${formatBytes(totalJsBytes)} · entry JS ${formatBytes(entryJsBytes)} · entry CSS ${formatBytes(entryCssBytes)}`
);

if (failures.length) {
  console.error("Build performance bütçesi aşıldı:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("✓ Build performance bütçeleri içinde.");

async function sumReferenced(references) {
  let total = 0;
  for (const reference of references) {
    if (/^https?:\/\//i.test(reference)) continue;
    const clean = reference.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/, 1)[0];
    if (!clean) continue;
    try {
      const info = await stat(resolve(dist, clean));
      total += info.size;
    } catch {
      // verify-build.mjs reports missing references separately.
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
