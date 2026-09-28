import { readFile } from "node:fs/promises";
import { summarizeScaleCoverage } from "./observability-coverage.ts";

const report = JSON.parse(await readFile("service-scale-audit.json", "utf8"));
const errors: string[] = [];
const results = Array.isArray(report?.results) ? report.results : [];

if (report?.schemaVersion !== 1) errors.push("Scale audit schemaVersion 1 olmalı.");
if (!Array.isArray(report?.results)) errors.push("Scale audit results bir dizi olmalı.");
if (report?.total !== results.length) errors.push("Scale audit total, results uzunluğuyla eşleşmiyor.");
if (typeof report?.auditedAt !== "string" || Number.isNaN(Date.parse(report.auditedAt))) {
  errors.push("Scale audit auditedAt geçerli ISO tarih olmalı.");
}

const serialized = JSON.stringify(report);
if (/tokenUrl|https?:\/\//i.test(serialized)) {
  errors.push("Scale audit endpoint veya token-benzeri URL içeriyor; artifact güvenli değil.");
}

for (const [index, entry] of results.entries()) {
  if (!entry || typeof entry !== "object") {
    errors.push(`Scale audit #${index + 1}: nesne değil.`);
    continue;
  }
  if (entry.source === "client-ip-required" && entry.reachable !== false) {
    errors.push(`Scale audit #${index + 1}: client-ip-required kayıt public runner tarafından reachable sayılamaz.`);
  }
}

const coverage = summarizeScaleCoverage(results);
const expected = {
  probeableTotal: coverage.probeableTotal,
  clientIpRequired: coverage.clientIpRequired,
  reachableProbeable: coverage.reachableProbeable,
  unreachableProbeable: coverage.unreachableProbeable,
  explicitScaleLimits: coverage.explicitScaleLimits
};

for (const [key, value] of Object.entries(expected)) {
  if (report?.[key] !== value) errors.push(`Scale audit ${key}=${value} olmalı; mevcut=${String(report?.[key])}.`);
}

// `reachable` is kept as a backwards-compatible alias, but its semantics are now
// explicitly limited to services that the public runner is allowed to probe.
if (report?.reachable !== coverage.reachableProbeable) {
  errors.push(`Scale audit reachable=${coverage.reachableProbeable} olmalı.`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `✓ Scale audit doğrulandı · probeable=${coverage.probeableTotal}/${coverage.total} · reachable=${coverage.reachableProbeable}/${coverage.probeableTotal} · client-ip-required=${coverage.clientIpRequired}`
);
