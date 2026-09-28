import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("service health monitor workflow", () => {
  it("installs engineering dependencies before running TypeScript probes", async () => {
    const workflow = await readFile(".github/workflows/service-health.yml", "utf8");

    const install = workflow.indexOf("npm install --no-audit --no-fund");
    const probe = workflow.indexOf("npm run probe:services");
    const validate = workflow.indexOf("npm run validate:health");
    const audit = workflow.indexOf("npm run audit:scales");

    expect(install).toBeGreaterThan(-1);
    expect(probe).toBeGreaterThan(install);
    expect(validate).toBeGreaterThan(probe);
    expect(audit).toBeGreaterThan(validate);
    expect(workflow).toContain("actions/setup-node@v7");
    expect(workflow).toContain("node-version: 24");
  });
});
