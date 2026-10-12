import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { RawServiceDefinition } from "../src/types";

async function expectCurrentSceneScale(page: Page) {
  await expect.poll(() => page.locator("arcgis-scene").evaluate((element) => {
    const scale = (element as unknown as { scale: number }).scale;
    return Number.isFinite(scale) && scale > 0
      && document.querySelector(".status-scale strong")?.textContent === "1:" + Math.round(scale).toLocaleString("tr-TR");
  })).toBe(true);
}

test("production scene renders all public layers and reopens cached layers", async ({ page }, info) => {
  const runtimeErrors: string[] = [];
  const failedSdkAssets: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.name));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.includes("/sdk-assets/") && !response.ok()) failedSdkAssets.push(String(response.status()));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  await expect(page.locator(".fatal-screen")).toHaveCount(0);
  await expect.poll(() => page.locator("arcgis-scene").evaluate((element) => (element as unknown as { ready: boolean }).ready)).toBe(true);
  // A touch user has no pointer-move event to initialize the footer. Read the
  // real SDK scale and verify it is published before any map interaction.
  await expectCurrentSceneScale(page);

  // The default startup boundary is a real citizen-visible layer. Verify that
  // initial Scene/SDK pressure does not trigger a destructive recycle loop
  // before moving on to the isolated ten-layer matrix below.
  const startupReadyAt = Date.now();
  const startupLayer = page.locator(".layer-card.is-active");
  await expect(startupLayer).toHaveCount(1);
  await expect(startupLayer).toHaveAttribute("data-render-state", "ready", { timeout: 90_000 });
  await expect(page.locator(".status-readiness")).toHaveAttribute("data-tone", "ready", { timeout: 5_000 });
  const startupReadyMs = Date.now() - startupReadyAt;

  // Neutralize the startup view so each public provider is then measured from
  // the same isolated baseline.
  await page.locator(".advanced-layer-filters > summary").click();
  const closeAll = page.getByRole("button", { name: "Açık katmanları kapat", exact: true });
  if (await closeAll.isEnabled()) await closeAll.click();
  await page.locator(".advanced-layer-filters > summary").click();

  const catalog = await page.request.get("/services.json").then((response) => response.json()) as { services: RawServiceDefinition[] };
  const publicLayers = catalog.services.filter((service) => !service.tokenUrl.includes("/__runtime__/"));
  expect(publicLayers).toHaveLength(10);
  const metrics: Array<{ name: string; kind: string; firstReadyMs: number; cachedReadyMs: number; dataResponses: number }> = [];

  for (const service of publicLayers) {
    const card = page.locator(".layer-card").filter({ has: page.getByText(service.cografiVeriKatmanAdi, { exact: true }) });
    const serviceId = await card.getAttribute("data-service-id");
    const requests = { data: 0 };
    const endpoint = new URL(service.tokenUrl);
    const onResponse = (response: import("@playwright/test").Response) => {
      const url = new URL(response.url());
      if (url.host === endpoint.host && response.ok() && /export|query|nodes|nodepages|geometries|textures|attributes/i.test(url.pathname)) requests.data += 1;
    };
    page.on("response", onResponse);
    const toggle = card.locator(".visibility-button");
    const started = Date.now();
    await toggle.click();
    await expect(card).toHaveAttribute("data-render-state", "ready");
    await expect(card).not.toHaveClass(/status-error/);
    await expectCurrentSceneScale(page);
    const firstReadyMs = Date.now() - started;
    const state = await page.locator("arcgis-scene").evaluate(async (element, id) => {
      const scene = element as unknown as {
        map: { layers: { toArray(): Array<{ id: string; visible: boolean; loaded: boolean }> } };
        whenLayerView(layer: unknown): Promise<{ updating: boolean; visible: boolean; visibleAtCurrentScale: boolean }>;
        takeScreenshot(options: { format: string }): Promise<{ dataUrl: string }>;
      };
      const layer = scene.map.layers.toArray().find((candidate) => candidate.id === "svc-" + id);
      if (!layer) return null;
      const layerView = await scene.whenLayerView(layer);
      const screenshot = await scene.takeScreenshot({ format: "png" });
      return { loaded: layer.loaded, visible: layer.visible, inScale: layerView.visibleAtCurrentScale, settled: !layerView.updating, screenshotBytes: screenshot.dataUrl.length };
    }, serviceId);
    expect(state).toMatchObject({ loaded: true, visible: true, inScale: true, settled: true });
    expect(state!.screenshotBytes).toBeGreaterThan(1000);
    await page.screenshot({ path: info.outputPath(service.servisTuruAdi + "-" + metrics.length + ".png"), animations: "disabled" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const reopenedAt = Date.now();
    await toggle.click();
    await expect(card).toHaveAttribute("data-render-state", "ready");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const cachedReadyMs = Date.now() - reopenedAt;
    // Software rendering and upstream data latency vary; keep this as an
    // observed metric, not a promise that an external server obeys a deadline.
    metrics.push({ name: service.cografiVeriKatmanAdi, kind: service.servisTuruAdi, firstReadyMs, cachedReadyMs, dataResponses: requests.data });
    page.off("response", onResponse);
    await toggle.click();
  }
  await writeFile(info.outputPath("public-layer-timings.json"), JSON.stringify({ testedAt: new Date().toISOString(), startupReadyMs, metrics, runtimeErrors, failedSdkAssets }, null, 2));
  expect(failedSdkAssets).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(metrics).toHaveLength(10);
});
