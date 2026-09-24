import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalog = JSON.parse(await readFile(resolve("public/services.json"), "utf8"));
const snapshot = JSON.parse(await readFile(resolve("public/service-zoom.json"), "utf8"));
const services = Array.isArray(catalog?.services) ? catalog.services : [];
const profiles = Array.isArray(snapshot?.profiles) ? snapshot.profiles : [];
const statuses = new Set(["verified-range", "declared-range", "no-hard-limit", "unavailable", "metadata-only"]);
const sources = new Set(["multi-zoom-render", "service-metadata", "capabilities", "metadata"]);
const errors = [];

if (snapshot?.schemaVersion !== 1) errors.push("service-zoom.json: schemaVersion 1 olmalı.");
if (typeof snapshot?.verifiedAt !== "string" || Number.isNaN(Date.parse(snapshot.verifiedAt))) errors.push("service-zoom.json: verifiedAt geçersiz.");
if (typeof snapshot?.scaleModel !== "string" || snapshot.scaleModel.length < 8) errors.push("service-zoom.json: scaleModel eksik.");
if (profiles.length !== services.length) errors.push(`service-zoom.json: ${profiles.length}/${services.length} profil var.`);

const seen = new Set();
for (const [position, profile] of profiles.entries()) {
  if (!profile || typeof profile !== "object") { errors.push(`profile #${position + 1}: nesne olmalı.`); continue; }
  const index = profile.index;
  if (!Number.isInteger(index) || index < 0 || index >= services.length) { errors.push(`profile #${position + 1}: index geçersiz.`); continue; }
  if (seen.has(index)) errors.push(`profile #${position + 1}: index tekrarı.`);
  seen.add(index);
  const service = services[index];
  if (profile.name !== service.cografiVeriKatmanAdi) errors.push(`profile #${position + 1}: ad katalogla eşleşmiyor.`);
  if (profile.kind !== service.servisTuruAdi) errors.push(`profile #${position + 1}: tür katalogla eşleşmiyor.`);
  if (!statuses.has(profile.status)) errors.push(`profile #${position + 1}: status geçersiz.`);
  if (!sources.has(profile.source)) errors.push(`profile #${position + 1}: source geçersiz.`);
  for (const key of ["minZoom", "maxZoom", "testedMinZoom", "testedMaxZoom"]) {
    if (profile[key] !== undefined && (!Number.isFinite(profile[key]) || profile[key] < 0 || profile[key] > 30)) errors.push(`profile #${position + 1}: ${key} geçersiz.`);
  }
  if (profile.minZoom !== undefined && profile.maxZoom !== undefined && profile.minZoom > profile.maxZoom) errors.push(`profile #${position + 1}: minZoom > maxZoom.`);
  if (profile.status === "unavailable" && (profile.minZoom !== undefined || profile.maxZoom !== undefined)) errors.push(`profile #${position + 1}: unavailable profil hard zoom sınırı taşımamalı.`);
  if (profile.status === "no-hard-limit" && (profile.minZoom !== undefined || profile.maxZoom !== undefined)) errors.push(`profile #${position + 1}: no-hard-limit profil hard zoom sınırı taşımamalı.`);
  if (typeof profile.note === "string" && /https?:\/\/|token|ucbp\./i.test(profile.note)) errors.push(`profile #${position + 1}: note URL/token içeriyor.`);
  for (const forbidden of ["url", "tokenUrl", "endpoint", "secret", "token"]) if (Object.hasOwn(profile, forbidden)) errors.push(`profile #${position + 1}: yasak alan '${forbidden}'.`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const constrained = profiles.filter((profile) => profile.minZoom !== undefined || profile.maxZoom !== undefined).length;
console.log(`✓ Servis zoom profilleri doğrulandı: ${profiles.length} profil · ${constrained} zoom sınırlı.`);
