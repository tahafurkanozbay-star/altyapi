import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const indexPath = resolve(dist, "index.html");
const [html, packageText, serviceWorker] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile(resolve("package.json"), "utf8"),
  readFile(resolve(dist, "sw.js"), "utf8")
]);
const errors: string[] = [];
const packageJson = JSON.parse(packageText) as { version?: string };
const release = packageJson.version;

if (/\/src\/(?:main\.tsx|boot\.ts)|src\/(?:main\.tsx|boot\.ts)/.test(html)) {
  errors.push("dist/index.html hâlâ TypeScript kaynak girişine referans veriyor.");
}

const moduleScripts = [...html.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/g)].map((match) => match[1]);
const localScripts = moduleScripts.filter((src): src is string => typeof src === "string" && !/^https?:\/\//i.test(src));
if (localScripts.length === 0) errors.push("Üretim HTML'inde yerel JavaScript bundle bulunamadı.");

for (const source of localScripts) {
  const clean = source.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/, 1)[0];
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

if (typeof release !== "string" || !/^\d+\.\d+\.\d+$/.test(release)) {
  errors.push("package.json sürümü geçerli semver değil.");
} else {
  if (!serviceWorker.includes(`release ${release}`)) errors.push("Service Worker üretim banner'ı package sürümüyle eşleşmiyor.");
  if (!serviceWorker.includes(`const RELEASE = "${release}"`)) errors.push("Service Worker runtime release değeri package sürümüyle eşleşmiyor.");
  for (const prefix of ["altyapi-shell-v", "altyapi-data-v", "altyapi-runtime-v"]) {
    if (!serviceWorker.includes(prefix)) errors.push(`Service Worker cache ailesi eksik: ${prefix}`);
  }
}
if (serviceWorker.includes("__ALTYAPI_RELEASE__")) errors.push("Service Worker release placeholder üretim çıktısında kaldı.");
if (!serviceWorker.includes("SENSITIVE_QUERY_KEYS") || !serviceWorker.includes("authorization")) {
  errors.push("Service Worker hassas istek cache koruması üretim çıktısında bulunamadı.");
}

if (errors.length > 0) {
  console.error("Build doğrulaması başarısız:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(`✓ Build doğrulandı: release ${release}, ${localScripts.length} yerel module bundle ve güvenli generated Service Worker hazır.`);
