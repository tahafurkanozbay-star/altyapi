import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const indexPath = resolve(dist, "index.html");
const [html, packageText] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile("package.json", "utf8")
]);
const errors: string[] = [];

if (/\/src\/main\.tsx|src\/main\.tsx/.test(html)) {
  errors.push("dist/index.html hâlâ TypeScript kaynak girişine referans veriyor.");
}

const moduleScripts = [...html.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter((source): source is string => typeof source === "string");
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

const manifest = JSON.parse(packageText) as { version?: string };
const major = Number(manifest.version?.split(".")[0]);
try {
  const worker = await readFile(resolve(dist, "sw.js"), "utf8");
  if (!worker.startsWith("/* AUTO-GENERATED from worker/service-worker.ts. DO NOT EDIT. */")) {
    errors.push("Üretim Service Worker'ı typed kaynak üretim başlığını taşımıyor.");
  }
  if (!Number.isInteger(major) || major <= 0) {
    errors.push("package.json release major sürümü geçersiz.");
  } else {
    if (!worker.includes(`const SHELL_CACHE = "altyapi-shell-v${major}"`)) {
      errors.push("Service Worker shell cache nesli package major sürümüyle eşleşmiyor.");
    }
    if (!worker.includes(`const DATA_CACHE = "altyapi-data-v${major}"`)) {
      errors.push("Service Worker data cache nesli package major sürümüyle eşleşmiyor.");
    }
  }
} catch {
  errors.push("Üretim Service Worker dosyası okunamadı.");
}

if (errors.length > 0) {
  console.error("Build doğrulaması başarısız:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(`✓ Build doğrulandı: ${localScripts.length} yerel module bundle, typed Service Worker ve gerekli statik dosyalar hazır.`);
