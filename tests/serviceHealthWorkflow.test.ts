import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("service health monitor workflow", () => {
  it("installs engineering dependencies before running TypeScript probes", async () => {
    const workflow = await readFile(".github/workflows/service-health.yml", "utf8");

    const install = workflow.indexOf("npm install --no-audit --no-fund");
    const probe = workflow.indexOf("npm run probe:services");
    const validate = workflow.indexOf("npm run validate:health");
    const audit = workflow.indexOf("npm run audit:scales");
    const validateScale = workflow.indexOf("npm run validate:scale-audit");
    const summary = workflow.indexOf("npm run summary:observability");

    expect(install).toBeGreaterThan(-1);
    expect(probe).toBeGreaterThan(install);
    expect(validate).toBeGreaterThan(probe);
    expect(audit).toBeGreaterThan(validate);
    expect(validateScale).toBeGreaterThan(audit);
    expect(summary).toBeGreaterThan(validateScale);
    expect(workflow).toContain("actions/setup-node@v7");
    expect(workflow).toContain("node-version: 24");
  });

  it("uses tested TypeScript tooling instead of duplicating coverage arithmetic in workflow YAML", async () => {
    const workflow = await readFile(".github/workflows/service-health.yml", "utf8");
    const packageJson = await readFile("package.json", "utf8");

    expect(packageJson).toContain('"validate:scale-audit": "tsx scripts/validate-scale-audit.ts"');
    expect(packageJson).toContain('"summary:observability": "tsx scripts/write-observability-summary.ts"');
    expect(packageJson).toContain("tsx scripts/finalize-scale-audit.ts");
    expect(workflow).not.toContain("s.reachable}/${s.total");
    expect(workflow).not.toContain("const states =");
  });
});
