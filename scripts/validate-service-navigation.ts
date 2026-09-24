import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalog = JSON.parse(await readFile(resolve("public/services.json"), "utf8"));
const snapshot = JSON.parse(await readFile(resolve("public/service-navigation.json"), "utf8"));
const errors = [];

const services = Array.isArray(catalog?.services) ? catalog.services : [];
const profiles = Array.isArray(snapshot?.profiles) ? snapshot.profiles : [];
const allowedSources = new Set(["verified-query", "declared-service", "verified-render"]);
const seen = new Set();

if (snapshot?.schemaVersion !== 1) errors.push("service-navigation.json: schemaVersion 1 olmalı.");
if (typeof snapshot?.verifiedAt !== "string" || Number.isNaN(Date.parse(snapshot.verifiedAt))) {
  errors.push("service-navigation.json: verifiedAt geçerli ISO tarih olmalı.");
}
if (typeof snapshot?.source !== "string" || snapshot.source.length < 3 || snapshot.source.length > 200) {
  errors.push("service-navigation.json: source eksik veya geçersiz.");
}
if (!Array.isArray(snapshot?.profiles)) errors.push("service-navigation.json: profiles bir dizi olmalı.");

for (const [position, profile] of profiles.entries()) {
  if (!profile || typeof profile !== "object") {
    errors.push(`profile #${position + 1}: nesne olmalı.`);
    continue;
  }

  const index = profile.index;
  if (!Number.isInteger(index) || index < 0 || index >= services.length) {
    errors.push(`profile #${position + 1}: index geçersiz.`);
    continue;
  }
  if (seen.has(index)) errors.push(`profile #${position + 1}: index ${index} tekrarlanıyor.`);
  seen.add(index);

  const service = services[index];
  if (profile.name !== service.cografiVeriKatmanAdi) errors.push(`profile #${position + 1}: katman adı katalogla eşleşmiyor.`);
  if (profile.kind !== service.servisTuruAdi) errors.push(`profile #${position + 1}: servis türü katalogla eşleşmiyor.`);
  if (!allowedSources.has(profile.source)) errors.push(`profile #${position + 1}: source geçersiz.`);

  const extent = profile.extent;
  if (!extent || typeof extent !== "object") {
    errors.push(`profile #${position + 1}: extent eksik.`);
  } else {
    const values = [extent.xmin, extent.ymin, extent.xmax, extent.ymax];
    if (!values.every(Number.isFinite)) errors.push(`profile #${position + 1}: extent koordinatları geçersiz.`);
    if (extent.wkid !== 4326) errors.push(`profile #${position + 1}: extent WKID 4326 olmalı.`);
    if (Number.isFinite(extent.xmin) && Number.isFinite(extent.xmax) && extent.xmin >= extent.xmax) {
      errors.push(`profile #${position + 1}: xmin < xmax olmalı.`);
    }
    if (Number.isFinite(extent.ymin) && Number.isFinite(extent.ymax) && extent.ymin >= extent.ymax) {
      errors.push(`profile #${position + 1}: ymin < ymax olmalı.`);
    }
    if (extent.xmin < -180 || extent.xmax > 180 || extent.ymin < -90 || extent.ymax > 90) {
      errors.push(`profile #${position + 1}: extent WGS84 sınırları dışında.`);
    }
  }

  for (const key of ["minScale", "maxScale", "recommendedScale"]) {
    if (profile[key] !== undefined && (!Number.isFinite(profile[key]) || profile[key] <= 0 || profile[key] > 1_000_000_000)) {
      errors.push(`profile #${position + 1}: ${key} geçersiz.`);
    }
  }

  if (profile.minScale && profile.maxScale && profile.maxScale > profile.minScale) {
    errors.push(`profile #${position + 1}: maxScale, minScale değerinden büyük olamaz.`);
  }
  if (profile.recommendedScale && profile.minScale && profile.recommendedScale > profile.minScale) {
    errors.push(`profile #${position + 1}: recommendedScale minScale dışında.`);
  }
  if (profile.recommendedScale && profile.maxScale && profile.recommendedScale < profile.maxScale) {
    errors.push(`profile #${position + 1}: recommendedScale maxScale dışında.`);
  }
  if (profile.renderScaleSensitive === true && !profile.minScale && !profile.maxScale) {
    errors.push(`profile #${position + 1}: renderScaleSensitive için ölçek sınırı gerekli.`);
  }

  if (typeof profile.note === "string" && /https?:\/\/|token|ucbp\./i.test(profile.note)) {
    errors.push(`profile #${position + 1}: note URL/token benzeri bilgi içeriyor.`);
  }

  for (const forbidden of ["url", "tokenUrl", "endpoint", "secret", "token"]) {
    if (Object.prototype.hasOwnProperty.call(profile, forbidden)) {
      errors.push(`profile #${position + 1}: yasak alan '${forbidden}'.`);
    }
  }
}

if (profiles.length === 0) errors.push("service-navigation.json: en az bir profil olmalı.");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const sensitive = profiles.filter((profile) => profile.renderScaleSensitive === true);
console.log(`✓ Servis navigasyon profilleri doğrulandı: ${profiles.length} profil · ${sensitive.length} ölçek-duyarlı katman.`);
