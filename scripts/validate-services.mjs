import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const file = resolve("public/services.json");
const data = JSON.parse(await readFile(file, "utf8"));
const allowed = new Set(["WMS", "WFS", "MapServer", "FeatureServer", "SceneServer"]);
const required = ["ustKurumAdi", "metaveriSahibiKurumAdi", "cografiVeriKatmanAdi", "servisTuruAdi", "tokenUrl"];
const secretQueryKey = /^(?:access_?token|api_?key|apikey|authorization|credential|key|secret|sig|signature|token)$/i;
const embeddedTokenPath = /\/(?:ucbp\.)?[A-Za-z0-9_-]{48,}(?:\.|\/|$)/i;
const errors = [];
const ids = new Set();

if (!Array.isArray(data.services)) errors.push("services.json: 'services' alanı bir dizi olmalı.");

for (const [index, service] of (data.services ?? []).entries()) {
  for (const key of required) {
    if (typeof service[key] !== "string" || !service[key].trim()) errors.push(`#${index + 1}: ${key} eksik veya geçersiz.`);
  }
  if (!allowed.has(service.servisTuruAdi)) errors.push(`#${index + 1}: desteklenmeyen tür '${service.servisTuruAdi}'.`);
  try {
    const url = new URL(service.tokenUrl);
    if (url.protocol !== "https:") errors.push(`#${index + 1}: HTTPS zorunlu.`);
    if (url.username || url.password) errors.push(`#${index + 1}: URL içinde kullanıcı adı/parola saklanamaz.`);
    if (embeddedTokenPath.test(url.pathname)) errors.push(`#${index + 1}: URL path içinde credential/token benzeri değer saklanamaz; güvenli proxy kullanın.`);
    for (const key of url.searchParams.keys()) {
      if (secretQueryKey.test(key)) errors.push(`#${index + 1}: URL query içinde '${key}' credential alanı saklanamaz; güvenli proxy kullanın.`);
    }
  } catch {
    errors.push(`#${index + 1}: tokenUrl geçerli bir URL değil.`);
  }
  const key = `${service.cografiVeriKatmanAdi}|${service.servisTuruAdi}|${service.tokenUrl}`;
  if (ids.has(key)) errors.push(`#${index + 1}: yinelenen servis kaydı.`);
  ids.add(key);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`✓ ${data.services.length} servis doğrulandı; şema, HTTPS, credential hijyeni ve tekrar kontrolleri başarılı.`);
