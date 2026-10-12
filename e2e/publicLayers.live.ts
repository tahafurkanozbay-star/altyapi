import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { RawServiceDefinition } from "../src/types";

async function expectCurrentSceneScale(page: Page) {
  await expect.poll(() => page.locator("arcgis-scene").evaluate((element) => {
    const scale = (element as unknown as { scale: number }).scale;
    const sdk = "1:" + Math.round(scale).toLocaleString("tr-TR");
    const footer = document.querySelector(".status-scale strong")?.textContent;
    return { sdk, footer, matches: Number.isFinite(scale) && scale > 0 && footer === sdk };
  })).toMatchObject({ matches: true });
}

async function readLayerDrawing(page: Page, id: string) {
  return page.locator("arcgis-scene").evaluate(async (element, serviceId) => {
    const scene = element as unknown as {
      extent: unknown;
      map: { layers: { toArray(): Array<{ id: string; visible: boolean; loaded: boolean }> } };
      whenLayerView(layer: unknown): Promise<{ updating: boolean; dataUpdating?: boolean; hasAllFeaturesInView?: boolean; visible: boolean; visibleAtCurrentScale: boolean; suspended: boolean; queryFeatureCount?(query: { geometry: unknown }): Promise<number> }>;
    };
    const layer = scene.map.layers.toArray().find((candidate) => candidate.id === "svc-" + serviceId);
    if (!layer) return null;
    const view = await scene.whenLayerView(layer);
    const settled = !view.updating;
    const count = !settled && view.queryFeatureCount
      ? await view.queryFeatureCount({ geometry: scene.extent }) : 0;
    const visible = layer.visible && view.visible && view.visibleAtCurrentScale && !view.suspended;
    return { loaded: layer.loaded, visible, settled, dataUpdating: view.dataUpdating, viewportCount: count, drawable: visible && (settled || Number.isFinite(count) && count > 0) };
  }, id);
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
  const startupId = await startupLayer.getAttribute("data-service-id");
  await expect.poll(() => readLayerDrawing(page, startupId!)).toMatchObject({ loaded: true, visible: true, drawable: true });
  const startupEvidence = await readLayerDrawing(page, startupId!);
  // The boundary's bright outline must actually reach the map framebuffer;
  // this is independent of both the app label and the local query result.
  const readBoundaryPixels = () => page.locator("arcgis-scene").evaluate(async (element) => {
    const scene = element as unknown as { takeScreenshot(options: { format: string }): Promise<{ data: ImageData }> };
    const pixels = (await scene.takeScreenshot({ format: "png" })).data.data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]!, green = pixels[index + 1]!, blue = pixels[index + 2]!;
      if (red > 180 && green < 130 && blue > 100 && red > green * 1.8) count += 1;
    }
    return count;
  });
  await expect.poll(readBoundaryPixels, { timeout: 90_000 }).toBeGreaterThan(128);
  const startupBoundaryPixels = await readBoundaryPixels();
  const startupDrawMs = Date.now() - startupReadyAt;
  await page.screenshot({ path: info.outputPath("startup-first-draw.png"), animations: "disabled" });

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
    // Allow the SDK's 60s network deadline plus bounded render recovery. The
    // assertions still require the real layer to become usable and drawable.
    await expect(card).toHaveAttribute("data-render-state", "ready", { timeout: 90_000 });
    await expect(card).not.toHaveClass(/status-error/);
    await expectCurrentSceneScale(page);
    const firstReadyMs = Date.now() - started;
    await expect.poll(() => readLayerDrawing(page, serviceId!)).toMatchObject({ loaded: true, visible: true, drawable: true });
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
    expect(state).toMatchObject({ loaded: true, visible: true, inScale: true });
    // Fully settled rendering or positive, queryable viewport data is required
    // independently of the app's readiness label above.
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
  // Exercise the actual lazy SDK components, beyond the isolated UI fixture.
  // arcgisReady is the SDK's signal that a component can be interacted with.
  await page.evaluate(() => {
    document.addEventListener("arcgisReady", (event) => {
      const component = event.composedPath()[0];
      if (component instanceof HTMLElement) component.dataset.liveComponentReady = "true";
    }, true);
  });
  const tools = [
    ["legend", "arcgis-legend"],
    ["basemap", "arcgis-basemap-gallery"],
    ["distance", "arcgis-direct-line-measurement-3d"],
    ["area", "arcgis-area-measurement-3d"],
    ["daylight", "arcgis-daylight"],
    ["slice", "arcgis-slice"],
    ["lineOfSight", "arcgis-line-of-sight"],
    ["elevation", "arcgis-elevation-profile"]
  ] as const;
  const toolMetrics: Array<{ tool: string; readyMs: number; completedMs: number }> = [];
  let distanceMeasurement: { value: string; unit: string } | undefined;
  for (const [tool, tag] of tools) {
    const openedAt = Date.now();
    await page.locator(`[data-tool-target="${tool}"]`).click();
    const component = page.locator(".map-tool-host " + tag);
    await expect(component).toBeVisible();
    await expect(component).toHaveAttribute("data-live-component-ready", "true");
    await expect(page.locator(".map-tool-panel")).toHaveAttribute("data-tool-state", "ready");
    await expect(page.locator(".map-tool-guidance")).not.toBeEmpty();
    expect(await component.evaluate((element) => (element as unknown as { referenceElement: Element }).referenceElement === document.querySelector("arcgis-scene"))).toBe(true);
    const readyMs = Date.now() - openedAt;
    if (tool === "basemap") {
      await expect(component.getByRole("radio")).toHaveCount(6);
      const topoItem = component.locator("arcgis-basemap-gallery-item").filter({ hasText: "Topoğrafik" });
      await expect.poll(() => topoItem.evaluate((element) => (element as unknown as { item: { state: string } }).item.state)).toBe("ready");
      await component.getByRole("radio", { name: "Topoğrafik", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Harita görünümü", exact: true })).toHaveValue("topo-vector");
      await expect.poll(() => page.locator("arcgis-scene").evaluate((element) => (element as unknown as { map: { basemap: { id: string } } }).map.basemap.id)).toBe("topo-vector");
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("altyapi:preferences:v5") ?? "{}").basemap)).toBe("topo-vector");
      // Restore the original basemap through the header and verify the gallery
      // also tracks changes in the opposite direction.
      await page.getByRole("combobox", { name: "Harita görünümü", exact: true }).selectOption("hybrid");
      await expect(component.getByRole("radio", { name: "Hibrit", exact: true })).toHaveAttribute("aria-checked", "true");
    }
    if (tool === "distance") {
      await component.getByRole("button", { name: "Yeni ölçüm", exact: true }).click();
      await expect.poll(() => component.evaluate((element) => (element as unknown as { state: string }).state)).toBe("measuring");
      await page.mouse.click(650, 450);
      await page.mouse.click(880, 510);
      await expect.poll(() => component.evaluate((element) => (element as unknown as { state: string }).state)).toBe("measured");
      // Placement finishes before the SDK's asynchronous distance calculation.
      // Wait for a citizen-visible result rather than accepting placeholder '-'.
      await expect(component.locator("output.value").first()).toHaveText(/\d/);
      await expect(component.locator(".unit").first()).toHaveText(/^(m|km)$/);
      distanceMeasurement = {
        value: (await component.locator("output.value").first().innerText()).trim(),
        unit: (await component.locator(".unit").first().innerText()).trim()
      };
    }
    toolMetrics.push({ tool, readyMs, completedMs: Date.now() - openedAt });
    await page.screenshot({ path: info.outputPath("tool-" + tool + ".png"), animations: "disabled" });
    await page.locator(".map-tool-header button").click({ timeout: 10_000 });
    await expect(page.locator(".map-tool-panel")).toHaveCount(0);
    await expect(component).toHaveCount(0);
  }
  // Verify the SDK's minimum-width controls also fit actual tablet/phone
  // panels, and leave the map usable when the layer panel was open.
  for (const [screen, width, height] of [["tablet", 820, 1180], ["mobile", 390, 844], ["small-mobile", 320, 640]] as const) {
    await page.setViewportSize({ width, height });
    await page.locator('[data-tool-target="area"]').click();
    await expect(page.locator(".main-panel")).toHaveCount(0);
    await expect(page.locator(".map-tool-panel")).toHaveAttribute("data-tool-state", "ready");
    const host = page.locator(".map-tool-host");
    await expect(host.locator("arcgis-area-measurement-3d")).toBeVisible();
    expect(await host.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect(host.getByRole("button", { name: "Yeni ölçüm", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("tool-area-" + screen + ".png"), animations: "disabled" });
    await page.locator(".map-tool-header button").click({ timeout: 10_000 });
    await expect(page.locator(".map-tool-panel")).toHaveCount(0);
  }
  await writeFile(info.outputPath("public-layer-timings.json"), JSON.stringify({ testedAt: new Date().toISOString(), startupReadyMs, startupDrawMs, startupBoundaryPixels, startupEvidence, metrics, toolMetrics, distanceMeasurement, runtimeErrors, failedSdkAssets }, null, 2));
  expect(failedSdkAssets).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(metrics).toHaveLength(10);
  expect(toolMetrics).toHaveLength(8);
});
