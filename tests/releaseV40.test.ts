import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v40 typed runtime architecture", () => {
  it("keeps release, PWA caches and strict compiler generation aligned", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version?: string };
    const worker = await readFile("public/sw.js", "utf8");
    const appConfig = await readFile("tsconfig.app.json", "utf8");

    expect(packageJson.version).toBe("40.0.0");
    expect(worker).toContain('altyapi-shell-v40');
    expect(worker).toContain('altyapi-data-v40');
    expect(appConfig).toContain('"verbatimModuleSyntax": true');
    expect(appConfig).toContain('"noImplicitReturns": true');
    expect(appConfig).toContain('"noFallthroughCasesInSwitch": true');
    expect(appConfig).toContain('"allowUnreachableCode": false');
  });

  it("routes application-owned runtime signals through a typed bus", async () => {
    const bus = await readFile("src/platform/runtimeEvents.ts", "utf8");
    const bridge = await readFile("src/platform/runtimeEventDomBridge.ts", "utf8");
    const activation = await readFile("src/gis/layerActivationState.ts", "utf8");
    const renderHealth = await readFile("src/lib/layerRenderHealth.ts", "utf8");
    const factory = await readFile("src/gis/layerFactory.ts", "utf8");
    const tucbsSetup = await readFile("src/components/TucbsAccessSetup.tsx", "utf8");

    expect(bus).toContain("interface RuntimeEventMap");
    expect(bus).toContain("publishRuntimeEvent");
    expect(bus).toContain("subscribeRuntimeEvent");
    expect(activation).toContain('publishRuntimeEvent("atomic-layer-activation-complete"');
    expect(renderHealth).toContain('subscribeRuntimeEvent("layer-render-health"');
    expect(factory).toContain('publishRuntimeEvent("tucbs-access-required"');
    expect(factory).not.toContain("window.dispatchEvent");
    expect(tucbsSetup).toContain('subscribeRuntimeEvent("tucbs-access-required"');
    expect(bridge).toContain("Compatibility boundary");
  });

  it("uses shared runtime contracts at public JSON trust boundaries", async () => {
    const contracts = await readFile("src/platform/runtimeContracts.ts", "utf8");
    const catalog = await readFile("src/lib/catalog.ts", "utf8");
    const health = await readFile("src/lib/serviceHealth.ts", "utf8");
    const navigation = await readFile("src/lib/serviceNavigation.ts", "utf8");

    expect(contracts).toContain("asRecord");
    expect(contracts).toContain("readEnum");
    expect(catalog).not.toContain("as unknown as RawServiceDefinition");
    expect(health).toContain("SERVICE_KINDS");
    expect(navigation).toContain("SERVICE_KINDS");
  });
});
