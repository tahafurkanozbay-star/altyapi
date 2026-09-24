import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v14 architecture guardrails", () => {
  it("does not regress to deprecated ArcGIS widget classes", async () => {
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");
    expect(runtime).not.toContain("@arcgis/core/widgets/");
    expect(runtime).toContain("@arcgis/map-components/components/arcgis-search");
    expect(runtime).toContain("@arcgis/map-components/components/arcgis-direct-line-measurement-3d");
  });

  it("uses the ArcGIS 5.1 component-first scene architecture", async () => {
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");
    const runtimeCss = await readFile("src/styles/runtime.css", "utf8");

    expect(runtime).toContain("@arcgis/map-components/components/arcgis-scene");
    expect(runtime).toContain('document.createElement("arcgis-scene")');
    expect(runtime).toContain("referenceElement = this.scene");
    expect(runtime).toContain("arcgisViewClick");
    expect(runtime).toContain("arcgisViewPointerMove");
    expect(runtime).toContain("tryFatalErrorRecovery");
    expect(runtime).not.toContain("@arcgis/core/views/SceneView.js");
    expect(runtime).not.toContain("new SceneView");
    expect(runtime).not.toContain("element.view =");
    expect(runtimeCss).toContain(".arcgis-scene-root");
  });

  it("ships the comfort-white visual stack as the default", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const storage = await readFile("src/lib/storage.ts", "utf8");
    const comfort = await readFile("src/styles/comfort-white.css", "utf8");

    expect(entry).toContain('@arcgis/core/assets/esri/themes/light/main.css');
    expect(entry).toContain('./styles/comfort-white.css');
    expect(storage).toContain('theme: "light"');
    expect(comfort).toContain("--comfort-white: #ffffff");
  });

  it("ships the query studio and workspace portability layers", async () => {
    const query = await readFile("src/lib/attributeQuery.ts", "utf8");
    const workspace = await readFile("src/lib/workspace.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(query).toContain("buildWhereClause");
    expect(workspace).toContain("parseWorkspaceSnapshot");
    expect(app).toContain("ViewTransition");
  });

  it("ships the resilient service health layer", async () => {
    const health = await readFile("src/lib/serviceHealth.ts", "utf8");
    const snapshot = await readFile("public/service-health.json", "utf8");
    const packageJson = await readFile("package.json", "utf8");
    const pages = await readFile(".github/workflows/pages.yml", "utf8");

    expect(health).toContain("SERVICE_HEALTH_MAX_AGE_MS");
    expect(health).toContain("failurePatch");
    expect(snapshot).not.toContain("tokenUrl");
    expect(snapshot).not.toContain("http://");
    expect(snapshot).not.toContain("https://");
    expect(packageJson).toContain("validate:health");
    expect(packageJson).toContain("probe:services");
    expect(pages).toContain("npm run probe:services");
    expect(pages).toContain('cron: "17 3 * * *"');
  });

  it("ships operations intelligence and offline-safe catalog caching", async () => {
    const intelligence = await readFile("src/lib/operationsIntelligence.ts", "utf8");
    const overview = await readFile("src/components/OperationsOverview.tsx", "utf8");
    const serviceWorker = await readFile("public/sw.js", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(intelligence).toContain("summarizeOperationalReadiness");
    expect(intelligence).toContain("serviceReadiness");
    expect(overview).toContain("OPERASYON HAZIRLIK");
    expect(app).toContain('useState<PanelId>("overview")');
    expect(serviceWorker).toContain("altyapi-data-v13");
    expect(serviceWorker).toContain("networkFirstData");
  });

  it("ships race-safe layer orchestration and sanitized incident diagnostics", async () => {
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");
    const incidents = await readFile("src/lib/incidentJournal.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");
    const operations = await readFile("src/components/OperationsPanel.tsx", "utf8");

    expect(runtime).toContain("loadingLayers");
    expect(runtime).toContain("desiredVisibility");
    expect(runtime).toContain("withTimeout");
    expect(runtime).toContain("superseded");
    expect(incidents).toContain("sanitizeIncidentText");
    expect(incidents).toContain("MAX_INCIDENTS = 80");
    expect(app).toContain("loadIncidentJournal");
    expect(operations).toContain("Olay Günlüğü");
  });

  it("ships verified operational extents and continuously enforced scale guardrails", async () => {
    const navigation = await readFile("src/lib/serviceNavigation.ts", "utf8");
    const snapshot = await readFile("public/service-navigation.json", "utf8");
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");
    const factory = await readFile("src/gis/layerFactory.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");
    const serviceWorker = await readFile("public/sw.js", "utf8");
    const packageJson = await readFile("package.json", "utf8");

    expect(navigation).toContain("isOperationalScale");
    expect(navigation).toContain("recommendedActivationScale");
    expect(navigation).toContain("activeOperationalScaleRange");
    expect(navigation).toContain("clampScaleToOperationalRange");
    expect(snapshot).not.toContain("tokenUrl");
    expect(snapshot).not.toContain("http://");
    expect(snapshot).not.toContain("https://");
    expect(runtime).toContain("prepareLayerActivation");
    expect(runtime).toContain("operationalExtentCenter");
    expect(runtime).toContain("activeScaleServices");
    expect(runtime).toContain("enforceScaleGuard");
    expect(runtime).toContain("arcgisViewChange");
    expect(factory).toContain("operationalMinScale");
    expect(factory).toContain("operationalMaxScale");
    expect(app).toContain("loadServiceNavigationSnapshot");
    expect(serviceWorker).toContain("service-navigation.json");
    expect(packageJson).toContain("validate:navigation");
    expect(packageJson).toContain("audit:scales");
  });

  it("ships adaptive stabilization, session analytics and controlled PWA updates", async () => {
    const stabilization = await readFile("src/lib/stabilization.ts", "utf8");
    const reliability = await readFile("src/lib/sessionReliability.ts", "utf8");
    const main = await readFile("src/main.tsx", "utf8");
    const serviceWorker = await readFile("public/sw.js", "utf8");
    const overview = await readFile("src/components/OperationsOverview.tsx", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(stabilization).toContain("buildStabilizationPlan");
    expect(reliability).toContain("summarizeIncidentReliability");
    expect(overview).toContain("ADAPTİF GÜVENLİ MOD");
    expect(app).toContain("stabilizeWorkspace");
    expect(app).toContain("altyapi:apply-update");
    expect(main).toContain("altyapi:update-available");
    expect(main).toContain("controllerchange");
    expect(serviceWorker).toContain('const SHELL_CACHE = "altyapi-shell-v13"');
    expect(serviceWorker).not.toContain("then(() => self.skipWaiting())");
  });
});
