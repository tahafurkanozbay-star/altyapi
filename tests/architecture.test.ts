import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v16 architecture guardrails", () => {
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

  it("keeps public data lookup while removing technical operations UI", async () => {
    const query = await readFile("src/lib/attributeQuery.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");
    const rail = await readFile("src/components/ToolRail.tsx", "utf8");
    const panel = await readFile("src/components/OperationsPanel.tsx", "utf8");
    const status = await readFile("src/components/StatusBar.tsx", "utf8");

    expect(query).toContain("buildWhereClause");
    expect(app).toContain('useState<PanelId>("layers")');
    expect(app).toContain("Ankara Kent Rehberi");
    expect(app).toContain("ViewTransition");
    expect(app).not.toContain("CommandPalette");
    expect(app).not.toContain("commandOpen");
    expect(app).not.toContain("performance-select");
    expect(rail).toContain("Katmanlar");
    expect(rail).toContain("Harita verisi");
    expect(rail).not.toContain("Operasyon özeti");
    expect(rail).not.toContain("Çalışma alanı paketi");
    expect(rail).not.toContain("Servis sağlığı");
    expect(rail).not.toContain("Olay günlüğü");
    expect(rail).not.toContain("Sistem tanılama");
    expect(rail).not.toContain("Komut paleti");
    expect(panel).toContain("KENT REHBERİ");
    expect(panel).not.toContain("OPERASYON MERKEZİ");
    expect(panel).not.toContain("Olay Günlüğü");
    expect(status).not.toContain("Hazırlık");
    expect(status).not.toContain("performance-pill");
  });

  it("ships the resilient service health layer without exposing it as a citizen panel", async () => {
    const health = await readFile("src/lib/serviceHealth.ts", "utf8");
    const snapshot = await readFile("public/service-health.json", "utf8");
    const packageJson = await readFile("package.json", "utf8");
    const pages = await readFile(".github/workflows/pages.yml", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(health).toContain("SERVICE_HEALTH_MAX_AGE_MS");
    expect(health).toContain("failurePatch");
    expect(snapshot).not.toContain("tokenUrl");
    expect(snapshot).not.toContain("http://");
    expect(snapshot).not.toContain("https://");
    expect(packageJson).toContain("validate:health");
    expect(packageJson).toContain("probe:services");
    expect(pages).toContain("npm run probe:services");
    expect(pages).toContain('cron: "17 3 * * *"');
    expect(app).toContain("loadServiceHealthSnapshot");
    expect(app).not.toContain('selectPanel("health")');
  });

  it("keeps operations intelligence available to engineering but out of the public shell", async () => {
    const intelligence = await readFile("src/lib/operationsIntelligence.ts", "utf8");
    const overview = await readFile("src/components/OperationsOverview.tsx", "utf8");
    const serviceWorker = await readFile("public/sw.js", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(intelligence).toContain("summarizeOperationalReadiness");
    expect(intelligence).toContain("serviceReadiness");
    expect(overview).toContain("OPERASYON HAZIRLIK");
    expect(app).not.toContain("OperationsOverview");
    expect(serviceWorker).toContain("altyapi-data-v16");
    expect(serviceWorker).toContain("networkFirstData");
  });

  it("ships fresh-instance adaptive layer recovery instead of attaching half-loaded layers", async () => {
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");
    const policy = await readFile("src/lib/serviceRuntime.ts", "utf8");
    const factory = await readFile("src/gis/layerFactory.ts", "utf8");
    const incidents = await readFile("src/lib/incidentJournal.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(runtime).toContain("loadingLayers");
    expect(runtime).toContain("desiredVisibility");
    expect(runtime).toContain("serviceRuntimePolicy");
    expect(runtime).toContain("shouldRetryServiceError");
    expect(runtime).toContain("serviceRetryDelayMs");
    expect(runtime).toContain("cancelLoad");
    expect(runtime).toContain("finalizeLoadedLayer");
    expect(runtime).toContain("each retry deliberately creates a fresh Layer instance");
    expect(policy).toContain("KIND_POLICY");
    expect(policy).toContain("MAX_LOAD_TIMEOUT_MS");
    expect(policy).toContain("classifyServiceError");
    expect(factory).toContain("ogcLayerMatchScore");
    expect(factory).toContain("allSublayers");
    expect(incidents).toContain("sanitizeIncidentText");
    expect(incidents).toContain("MAX_INCIDENTS = 80");
    expect(app).toContain("loadIncidentJournal");
    expect(app).toContain("incidentsRef");
    expect(app).not.toContain('selectPanel("incidents")');

    const loadPosition = runtime.indexOf("layer.load()");
    const addPosition = runtime.indexOf("this.map?.add(layer)", loadPosition);
    expect(loadPosition).toBeGreaterThan(-1);
    expect(addPosition).toBeGreaterThan(loadPosition);
  });

  it("ships verified operational extents and atomic continuous scale guardrails", async () => {
    const navigation = await readFile("src/lib/serviceNavigation.ts", "utf8");
    const snapshot = await readFile("public/service-navigation.json", "utf8");
    const runtime = await readFile("src/gis/ArcGISRuntime.ts", "utf8");
    const factory = await readFile("src/gis/layerFactory.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");
    const serviceWorker = await readFile("public/sw.js", "utf8");
    const packageJson = await readFile("package.json", "utf8");
    const monitor = await readFile(".github/workflows/service-health.yml", "utf8");

    expect(navigation).toContain("isOperationalScale");
    expect(navigation).toContain("recommendedActivationScale");
    expect(navigation).toContain("activeOperationalScaleRange");
    expect(navigation).toContain("resolveOperationalScaleRange");
    expect(navigation).toContain("clampScaleToOperationalRange");
    expect(snapshot).not.toContain("tokenUrl");
    expect(snapshot).not.toContain("http://");
    expect(snapshot).not.toContain("https://");
    expect(runtime).toContain("prepareLayerActivation");
    expect(runtime).toContain("operationalExtentCenter");
    expect(runtime).toContain("activeScaleServices");
    expect(runtime).toContain("enforceScaleGuard");
    expect(runtime).toContain("intent time");
    expect(runtime).toContain("resolveOperationalScaleRange([...this.activeScaleServices.values()], service)");
    expect(runtime).toContain("arcgisViewChange");
    expect(factory).toContain("operationalMinScale");
    expect(factory).toContain("operationalMaxScale");
    expect(app).toContain("loadServiceNavigationSnapshot");
    expect(serviceWorker).toContain("service-navigation.json");
    expect(packageJson).toContain("validate:navigation");
    expect(packageJson).toContain("audit:scales");
    expect(monitor).toContain("npm run audit:scales");
    expect(monitor).toContain("service-scale-audit.json");
  });

  it("supports direct TUCBS access from an approved client IP without publishing signed endpoints", async () => {
    const catalog = await readFile("public/services.json", "utf8");
    const tucbs = await readFile("src/lib/tucbsAccess.ts", "utf8");
    const setup = await readFile("src/components/TucbsAccessSetup.tsx", "utf8");
    const factory = await readFile("src/gis/layerFactory.ts", "utf8");
    const probe = await readFile("scripts/probe-service-health.ts", "utf8");
    const audit = await readFile("scripts/audit-service-scales.ts", "utf8");
    const entry = await readFile("src/main.tsx", "utf8");
    const privateExample = await readFile("public/services.private.example.json", "utf8");
    const validator = await readFile("scripts/validate-services.ts", "utf8");

    expect(catalog).toContain("ucbp-api.tucbs.gov.tr/__runtime__/");
    expect(catalog).not.toMatch(/\/ucbp\.[A-Za-z0-9_-]{20,}/i);
    expect(catalog).not.toMatch(/[?&](?:token|api_?key|secret)=/i);
    expect(catalog).not.toContain("YOUR-SECURE-PROXY.example");
    expect(tucbs).toContain('const TUCBS_HOST = "ucbp-api.tucbs.gov.tr"');
    expect(tucbs).toContain("sessionStorage");
    expect(tucbs).toContain("localStorage");
    expect(tucbs).toContain("sanitizeTucbsUrl");
    expect(tucbs).toContain("verifyTucbsEndpoints");
    expect(tucbs).toContain("GetCapabilities");
    expect(setup).toContain("await verifyTucbsEndpoints(endpoints)");
    expect(factory).toContain("altyapi:tucbs-access-required");
    expect(probe).toContain("isRuntimeTucbsService");
    expect(probe).toContain('access: "network-restricted"');
    expect(audit).toContain('source: "client-ip-required"');
    expect(entry).toContain("TucbsAccessSetupHost");
    expect(privateExample).toContain("YOUR-SECURE-PROXY.example");
    expect(validator).toContain("embeddedTokenPath");
    expect(validator).toContain("secretQueryKey");
  });

  it("uses TypeScript for application, tests and engineering service tooling", async () => {
    const packageJson = await readFile("package.json", "utf8");
    const scripts = await readdir("scripts");
    expect(packageJson).toContain('"tsx": "^4.23.15"');
    expect(packageJson).not.toContain("scripts/verify-build.mjs");
    expect(packageJson).not.toContain("scripts/probe-service-health.mjs");
    expect(scripts.filter((name) => name.endsWith(".mjs"))).toEqual([]);
    expect(scripts.filter((name) => name.endsWith(".ts")).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps adaptive reliability and controlled PWA updates in the background", async () => {
    const stabilization = await readFile("src/lib/stabilization.ts", "utf8");
    const reliability = await readFile("src/lib/sessionReliability.ts", "utf8");
    const main = await readFile("src/main.tsx", "utf8");
    const serviceWorker = await readFile("public/sw.js", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(stabilization).toContain("buildStabilizationPlan");
    expect(reliability).toContain("summarizeIncidentReliability");
    expect(app).not.toContain("stabilizeWorkspace");
    expect(app).toContain("detectPerformanceProfile");
    expect(app).toContain("altyapi:apply-update");
    expect(main).toContain("altyapi:update-available");
    expect(main).toContain("controllerchange");
    expect(serviceWorker).toContain('const SHELL_CACHE = "altyapi-shell-v16"');
    expect(serviceWorker).not.toContain("then(() => self.skipWaiting())");
  });
});
