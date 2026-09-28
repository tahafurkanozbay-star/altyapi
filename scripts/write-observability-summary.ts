import { readFile } from "node:fs/promises";
import { renderObservabilitySummary } from "../src/lib/observabilityCoverage.ts";

const health = JSON.parse(await readFile("public/service-health.json", "utf8"));
const scale = JSON.parse(await readFile("service-scale-audit.json", "utf8"));

if (!Array.isArray(health?.services) || typeof health?.generatedAt !== "string") {
  throw new Error("Service health snapshot is invalid.");
}
if (!Array.isArray(scale?.results) || typeof scale?.auditedAt !== "string") {
  throw new Error("Scale audit snapshot is invalid.");
}

console.log(renderObservabilitySummary({
  generatedAt: health.generatedAt,
  auditedAt: scale.auditedAt,
  health: health.services,
  scale: scale.results
}));
