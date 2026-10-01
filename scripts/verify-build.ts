import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const indexPath = resolve(dist, "index.html");
const html = await readFile(indexPath, "utf8");
const errors: string[] = [];

if (/\/src\/main\.tsx|src\/main\.tsx/.test(html)) {
  errors.push("dist/index.html hâlâ TypeScript kaynak girişine referans veriyor.");
}

const moduleScripts = [...html.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/g)].map((match) => match[1]);
const localScripts = moduleScripts.filter((src) => !/^https?:\/\//i.test(src));
if (localScripts.length === 0) errors.push("Üretim HTML'inde yerel JavaScript bundle bulunamadı.");

for (const source of localScripts) {
  const clean = source.replace(/^\.\//, "").split(/[?#]/, 1)[0];
  if (!clean) continue;
  try {
    const info = await stat(resolve(dist, clean));
    if (!info.isFile() || info.size === 0) errors.push(`Bundle boş veya dosya değil: ${source}`);
  } catch {
    errors.push(`HTML'in referans verdiği bundle bulunamadı: ${source}`);
  }
}

for (const required of ["services.json", "service-health.json", "service-navigation.json", "manifest.webmanifest", "favicon.svg", "sw.js", "health.html"]) {
  try {
    await access(resolve(dist, required));
  } catch {
    errors.push(`Üretim çıktısında gerekli dosya eksik: ${required}`);
  }
}

try {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version?: unknown };
  const version = typeof packageJson.version === "string" ? packageJson.version : "";
  const major = version.split(".", 1)[0];
  const serviceWorker = await readFile(resolve(dist, "sw.js"), "utf8");

  if (!serviceWorker.includes("GENERATED OUTPUT")) {
    errors.push("dist/sw.js strict TypeScript service worker kaynağından üretilmemiş görünüyor.");
  }
  if (!major || !serviceWorker.includes(`altyapi-shell-v${major}`) || !serviceWorker.includes(`altyapi-data-v${major}`)) {
    errors.push(`Service worker cache nesli package sürümüyle eşleşmiyor: ${version || "bilinmiyor"}.`);
  }
} catch (error) {
  errors.push(`Service worker sürüm doğrulaması çalıştırılamadı: ${error instanceof Error ? error.message : String(error)}`);
}

if (errors.length > 0) {
  console.error("Build doğrulaması başarısız:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(`✓ Build doğrulandı: ${localScripts.length} yerel module bundle, strict-TS service worker ve gerekli statik dosyalar hazır.`);
