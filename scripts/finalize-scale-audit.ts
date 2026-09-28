import { readFile, writeFile } from "node:fs/promises";
import { summarizeScaleCoverage } from "../src/lib/observabilityCoverage.ts";

const path = "service-scale-audit.json";
const report = JSON.parse(await readFile(path, "utf8"));
if (report?.schemaVersion !== 1 || !Array.isArray(report?.results)) {
  throw new Error("Scale audit cannot be finalized because its schema is invalid.");
}

const coverage = summarizeScaleCoverage(report.results);
const finalized = {
  ...report,
  total: coverage.total,
  probeableTotal: coverage.probeableTotal,
  reachable: coverage.reachableProbeable,
  reachableProbeable: coverage.reachableProbeable,
  unreachableProbeable: coverage.unreachableProbeable,
  clientIpRequired: coverage.clientIpRequired,
  explicitScaleLimits: coverage.explicitScaleLimits
};

await writeFile(path, JSON.stringify(finalized, null, 2) + "\n", "utf8");
console.log(
  `COVERAGE ${JSON.stringify({
    total: coverage.total,
    probeableTotal: coverage.probeableTotal,
    reachableProbeable: coverage.reachableProbeable,
    unreachableProbeable: coverage.unreachableProbeable,
    clientIpRequired: coverage.clientIpRequired,
    explicitScaleLimits: coverage.explicitScaleLimits
  })}`
);
