import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalog = JSON.parse(await readFile(resolve("public/services.json"), "utf8"));
const snapshot = JSON.parse(await readFile(resolve("public/service-health.json"), "utf8"));
const errors = [];

const allowedAvailability = new Set(["verified", "degraded", "unavailable", "unknown"]);
const allowedAccess = new Set(["public-browser", "network-restricted", "server-error", "unknown"]);

if (snapshot?.schemaVersion !== 1) errors.push("service-health.json: schemaVersion 1 olmalı.");
if (!Array.isArray(snapshot?.services)) errors.push("service-health.json: services bir dizi olmalı.");
if (!Array.isArray(catalog?.services)) errors.push("services.json: services bir dizi olmalı.");

const healthServices = Array.isArray(snapshot?.services) ? snapshot.services : [];
const catalogServices = Array.isArray(catalog?.services) ? catalog.services : [];

if (healthServices.length !== catalogServices.length) {
  errors.push(`service-health.json servis sayısı katalogla eşleşmiyor (${healthServices.length}/${catalogServices.length}).`);
}

for (const [index, entry] of healthServices.entries()) {
  const catalogEntry = catalogServices[index];
  if (!entry || typeof entry !== "object") {
    errors.push(`health #${index + 1}: nesne değil.`);
    continue;
  }
  if (entry.index !== index) errors.push(`health #${index + 1}: index ${index} olmalı.`);
  if (!catalogEntry) continue;
  if (entry.name !== catalogEntry.cografiVeriKatmanAdi) errors.push(`health #${index + 1}: katman adı katalogla eşleşmiyor.`);
  if (entry.kind !== catalogEntry.servisTuruAdi) errors.push(`health #${index + 1}: servis türü katalogla eşleşmiyor.`);
  if (!allowedAvailability.has(entry.availability)) errors.push(`health #${index + 1}: availability geçersiz.`);
  if (!allowedAccess.has(entry.access)) errors.push(`health #${index + 1}: access geçersiz.`);
  if (![true, false, null].includes(entry.browserCompatible)) errors.push(`health #${index + 1}: browserCompatible true/false/null olmalı.`);
  if (typeof entry.reason === "string" && /https?:\/\/|token|ucbp\./i.test(entry.reason)) {
    errors.push(`health #${index + 1}: reason alanı URL/token benzeri gizli ayrıntı içeriyor.`);
  }
  const forbiddenKeys = ["url", "tokenUrl", "endpoint", "secret", "token"];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(entry, key)) errors.push(`health #${index + 1}: yasak alan '${key}'.`);
  }
}

if (typeof snapshot?.generatedAt !== "string" || Number.isNaN(Date.parse(snapshot.generatedAt))) {
  errors.push("service-health.json: generatedAt geçerli ISO tarih olmalı.");
}
if (typeof snapshot?.source !== "string" || snapshot.source.length > 160) {
  errors.push("service-health.json: source eksik veya çok uzun.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const counts = Object.fromEntries(
  [...allowedAvailability].map((state) => [state, healthServices.filter((entry) => entry.availability === state).length])
);
console.log(`✓ Servis sağlık snapshot'ı doğrulandı: ${healthServices.length} kayıt · ${JSON.stringify(counts)}`);
