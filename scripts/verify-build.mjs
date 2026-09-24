import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const indexPath = resolve(dist, "index.html");
const html = await readFile(indexPath, "utf8");
const errors = [];

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

for (const required of ["services.json", "service-health.json", "service-navigation.json", "manifest.webmanifest", "favicon.svg", "ankara-logo.png", "sw.js", "health.html"]) {
  try {
    await access(resolve(dist, required));
  } catch {
    errors.push(`Üretim çıktısında gerekli dosya eksik: ${required}`);
  }
}

if (errors.length > 0) {
  console.error("Build doğrulaması başarısız:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(`✓ Build doğrulandı: ${localScripts.length} yerel module bundle ve gerekli statik dosyalar hazır.`);
