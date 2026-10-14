import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { decodeShareState } from "../src/lib/urlState";
import type { RawServiceDefinition } from "../src/types";

async function closeMapTool(page: Page) {
  const close = page.locator(".map-tool-header button");
  // Prove the close control owns the pointer hit, without forcing a click.
  // SwiftShader frames can pause for over 10s after switching a basemap;
  // use the existing SDK assertion deadline for normal click actionability.
  await expect.poll(() => close.evaluate((button) => {
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  await close.click({ timeout: 60_000 });
}

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
  // This full provider/tool matrix also covers sharing, PNG and saved views;
  // leave bounded room for diagnostics on the software-rendered CI browser.
  test.setTimeout(660_000);
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
      await expect(page.locator(".details-drawer")).toHaveCount(0);
    }
    toolMetrics.push({ tool, readyMs, completedMs: Date.now() - openedAt });
    await page.screenshot({ path: info.outputPath("tool-" + tool + ".png"), animations: "disabled" });
    await closeMapTool(page);
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
    await closeMapTool(page);
    await expect(page.locator(".map-tool-panel")).toHaveCount(0);
  }
  // Exercise the real server query transport and page-size refresh on the
  // public startup FeatureLayer, including the SDK's AbortSignal options.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-panel-target="data"]').click();
  await page.getByRole("combobox", { name: "Katman", exact: true }).selectOption(startupId!);
  const pageSize = page.getByRole("combobox", { name: "Sayfa boyutu", exact: true });
  await pageSize.selectOption("50");
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click();
  await expect.poll(() => page.locator(".attribute-table tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator(".data-error")).toHaveCount(0);
  await pageSize.selectOption("100");
  await expect(page.locator(".attribute-table caption")).toContainText("sayfa boyutu 100");
  await expect(page.locator(".data-results")).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.locator(".attribute-table tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator(".data-error")).toHaveCount(0);
  const queryToggle = page.locator(".server-query-studio > summary");
  await expect(page.locator(".server-query-studio")).not.toHaveAttribute("open");
  await queryToggle.click();
  const sort = page.getByRole("combobox", { name: "Sırala", exact: true });
  const sortField = await sort.locator("option").nth(1).getAttribute("value");
  await sort.selectOption(sortField!);
  await page.getByRole("combobox", { name: "Yön", exact: true }).selectOption("desc");
  await page.getByRole("button", { name: "Sorguyu uygula", exact: true }).click();
  await expect(queryToggle).toContainText("azalan");
  await expect(page.locator(".data-results")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".data-error")).toHaveCount(0);
  await queryToggle.click();
  await page.getByRole("button", { name: "Tabloya git", exact: true }).click();
  const attributeTable = page.getByRole("region", { name: "Öznitelik sonuç tablosu", exact: true });
  await expect(attributeTable).toBeFocused();
  await expect(attributeTable).toBeInViewport();
  await page.locator(".data-record-open").first().click();
  await expect(page.locator(".data-record-detail")).toBeFocused();
  await expect.poll(() => page.locator(".data-record-fields > div").count()).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("public-record-detail.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Kayıt ayrıntılarını kapat", exact: true }).click();
  await expect(page.locator(".data-record-open").first()).toBeFocused();
  const attributeQuery = {
    rows: await page.locator(".attribute-table tbody tr").count(),
    pageSize: await pageSize.inputValue(),
    pagination: await page.locator(".data-pagination").innerText(),
    sortField,
    queryDescription: await queryToggle.innerText()
  };
  await page.screenshot({ path: info.outputPath("public-attribute-query.png"), animations: "disabled" });
  await page.locator('[data-panel-target="layers"]').click();
  const sharedCard = page.locator(`.layer-card[data-service-id="${startupId}"]`);
  await sharedCard.locator(".visibility-button").click();
  await expect(sharedCard).toHaveAttribute("data-render-state", "ready");
  const opacity = sharedCard.getByRole("slider");
  await opacity.focus(); await page.keyboard.press("Home");
  for (let step = 0; step < 7; step++) await page.keyboard.press("ArrowRight");
  await expect(opacity).toHaveValue("0.35");
  const nativeOpacity = await page.locator("arcgis-scene").evaluate((element, id) => {
    const scene = element as unknown as { map: { layers: { toArray(): Array<{ id: string; opacity: number }> } } };
    return scene.map.layers.toArray().find(layer => layer.id === "svc-" + id)?.opacity;
  }, startupId!);
  expect(nativeOpacity).toBeCloseTo(0.35, 5);
  await page.getByRole("button", { name: "Mevcut harita görünümünü paylaş", exact: true }).click();
  const shareDialog = page.getByRole("dialog", { name: "Harita görünümünü paylaş", exact: true });
  const shared = decodeShareState(new URL(await shareDialog.getByRole("textbox", { name: "Paylaşım bağlantısı", exact: true }).inputValue()).searchParams);
  expect(shared?.layerOpacity?.[startupId!]).toBe(0.35);
  expect(shared?.layerIds).toEqual([startupId]);
  await page.screenshot({ path: info.outputPath("public-share-view.png"), animations: "disabled" });
  await shareDialog.getByRole("button", { name: "Paylaşım penceresini kapat", exact: true }).click();
  const pngPromise = page.waitForEvent("download");
  await page.locator('[data-tool-action="screenshot"]').click();
  const pngDownload = await pngPromise;
  const png = await readFile((await pngDownload.path())!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const mapCapture = { bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20), sharedOpacity: shared?.layerOpacity?.[startupId!] };
  expect(mapCapture.bytes).toBeGreaterThan(1000);
  expect(mapCapture.width).toBeGreaterThan(0); expect(mapCapture.width).toBeLessThanOrEqual(2400);
  expect(mapCapture.height).toBeGreaterThan(0); expect(mapCapture.height).toBeLessThanOrEqual(2400);
  await pngDownload.saveAs(info.outputPath("public-map-capture.png"));
  await expect(page.locator('[data-tool-action="screenshot"]')).toBeEnabled();
  await page.locator('[data-panel-target="bookmarks"]').click();
  await page.getByRole("button", { name: "Bu çalışma görünümünü kaydet", exact: true }).click();
  const savedViewDialog = page.getByRole("dialog", { name: "Bu görünümü kaydet", exact: true });
  await savedViewDialog.getByRole("textbox", { name: "Görünüm adı", exact: true }).fill("Canlı doğrulama görünümü");
  await savedViewDialog.getByRole("button", { name: "Görünümü kaydet", exact: true }).click();
  const savedCamera = await page.locator("arcgis-scene").evaluate(element => {
    const camera = (element as unknown as { camera: { position: { longitude: number; latitude: number; z: number } } }).camera;
    return { longitude: camera.position.longitude, latitude: camera.position.latitude, z: camera.position.z };
  });
  const restoreStarted = Date.now();
  const restoreButton = page.getByRole("button", { name: "Canlı doğrulama görünümü çalışma görünümüne git", exact: true });
  await restoreButton.click();
  await expect(page.locator(".toast-success").filter({ hasText: "Canlı doğrulama görünümü çalışma görünümü geri yüklendi" })).toHaveCount(1);
  await expect(restoreButton).not.toHaveAttribute("aria-busy", "true");
  const bookmarkRestore = await page.locator("arcgis-scene").evaluate((element, id) => {
    const scene = element as unknown as { camera: { position: { longitude: number; latitude: number; z: number } }; map: { basemap: { id: string }; layers: { toArray(): Array<{ id: string; opacity: number }> } } };
    return { longitude: scene.camera.position.longitude, latitude: scene.camera.position.latitude, z: scene.camera.position.z, basemap: scene.map.basemap.id, opacity: scene.map.layers.toArray().find(layer => layer.id === "svc-" + id)?.opacity };
  }, startupId!);
  expect(bookmarkRestore.longitude).toBeCloseTo(savedCamera.longitude, 5); expect(bookmarkRestore.latitude).toBeCloseTo(savedCamera.latitude, 5);
  expect(bookmarkRestore.z).toBeCloseTo(savedCamera.z, 0); expect(bookmarkRestore.opacity).toBeCloseTo(0.35, 5); expect(bookmarkRestore.basemap).toBe("hybrid");
  const bookmarkReadyMs = Date.now() - restoreStarted;
  const screenshotStarted = Date.now();
  await page.locator(".operations-panel").screenshot({ path: info.outputPath("public-bookmark-restore.png"), animations: "disabled", timeout: 45_000 });
  const bookmarkScreenshotMs = Date.now() - screenshotStarted;
  await writeFile(info.outputPath("public-layer-timings.json"), JSON.stringify({ testedAt: new Date().toISOString(), startupReadyMs, startupDrawMs, startupBoundaryPixels, startupEvidence, metrics, toolMetrics, distanceMeasurement, attributeQuery, mapCapture, bookmarkRestore: { ...bookmarkRestore, readyMs: bookmarkReadyMs }, bookmarkScreenshotMs, runtimeErrors, failedSdkAssets }, null, 2));
  expect(failedSdkAssets).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(metrics).toHaveLength(10);
  expect(toolMetrics).toHaveLength(8);
});
