import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { runtimeFixture } from "./runtimeFixture";

type RestoreWindow = Window & {
  heldLayers: string[]; failedLayers: string[];
  releaseLayers: Record<string, Array<() => void>>;
  restoreCalls: Array<{ id: string; visible: boolean; opacity: number }>;
  restoreCompleted: string[]; sdkOpacity: Record<string, number>; sdkOrder: string[]; sdkBasemap: string;
  navigation: number[]; cameraMode: string; cameraStarts: number; releaseCamera?: () => void;
};
const transport = runtimeFixture
  .replace("this.desired = new Map();", "this.desired = new Map(); this.loaded = new Set();")
  .replace(/async setLayerVisible\(service, visible\) \{[\s\S]*?\n  \}/, `async setLayerVisible(service, visible) {
    this.desired.set(service.id, visible);
    window.restoreCalls.push({id:service.id,visible,opacity:service.opacity});
    if (visible && window.heldLayers.includes(service.id)) await new Promise(resolve => {
      (window.releaseLayers[service.id] ||= []).push(resolve);
    });
    if (visible) window.restoreCompleted.push(service.id);
    if (visible && window.failedLayers.includes(service.id)) return {ok:false,error:'Provider unavailable',durationMs:0};
    const superseded = this.desired.get(service.id) !== visible;
    if (visible && !superseded) { this.loaded.add(service.id); window.sdkOpacity[service.id] = service.opacity; }
    return {ok:true,durationMs:0,superseded};
  }`)
  .replace("setLayerOrder() {} setOpacity() {} setBasemap() {} destroy() {}", `setLayerOrder(ids) { window.sdkOrder = [...ids]; }
  setOpacity(id, value) { if(this.loaded.has(id)) window.sdkOpacity[id] = value; }
  setBasemap(value) { window.sdkBasemap = value; } destroy() {}`)
  .replace("async goTo(camera) { this.camera = camera; }", `async goTo(camera, signal) {
    window.cameraStarts++; const mode = window.cameraMode; window.cameraMode = 'success';
    if(mode === 'hold') await new Promise((resolve,reject) => {
      window.releaseCamera = resolve;
      signal?.addEventListener('abort', () => reject(signal.reason), {once:true});
    });
    signal?.throwIfAborted();
    if(mode === 'fail') throw new Error('Navigation failed');
    this.camera = camera; window.navigation.push(camera.longitude);
  }`);

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => Object.assign(window, {
    heldLayers: [], failedLayers: [], releaseLayers: {}, restoreCalls: [], restoreCompleted: [],
    sdkOpacity: {}, sdkOrder: [], sdkBasemap: "hybrid", navigation: [], cameraMode: "success", cameraStarts: 0
  }));
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: "text/javascript", body: transport }));
  await page.route("https://**/*", route => route.abort());
});

async function prepare(page: Page, both = false) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  const cards = page.locator('.layer-card[data-kind="FeatureServer"]');
  await expect(cards).toHaveCount(2);
  const a = (await cards.nth(0).getAttribute("data-service-id"))!;
  const b = (await cards.nth(1).getAttribute("data-service-id"))!;
  const c = (await page.locator('.layer-card[data-kind="MapServer"]').first().getAttribute("data-service-id"))!;
  const aName = (await cards.nth(0).locator(".layer-card-title strong").textContent())!.trim();
  const bName = (await cards.nth(1).locator(".layer-card-title strong").textContent())!.trim();
  await page.evaluate(({ a, b, both }) => {
    const camera = { longitude: 32.81, latitude: 39.93, z: 3500, heading: 22, tilt: 45 };
    const bookmarks = [
      { id: "first", name: "İlk görünüm", camera, layerIds: both ? [a, b] : [a], layerOrder: [a, b], layerOpacity: { [a]: 0.2, [b]: 0.6 }, basemap: "hybrid", createdAt: new Date().toISOString() },
      { id: "last", name: "Son görünüm", camera: { ...camera, longitude: 32.92 }, layerIds: [b], layerOrder: [b, a], layerOpacity: { [b]: 0.8 }, basemap: "topo-vector", createdAt: new Date().toISOString() }
    ];
    localStorage.setItem("altyapi:preferences:v5", JSON.stringify({ bookmarks, layerVisibility: { [a]: false, [b]: false }, layerOrder: [a, b] }));
  }, { a, b, both });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  await page.locator('[data-panel-target="bookmarks"]').click();
  await expect(page.locator(".bookmark-card")).toHaveCount(2);
  return { a, b, c, aName, bName };
}
const first = (page: Page) => page.getByRole("button", { name: "İlk görünüm çalışma görünümüne git", exact: true });
const last = (page: Page) => page.getByRole("button", { name: "Son görünüm çalışma görünümüne git", exact: true });
const stop = (page: Page) => page.getByRole("button", { name: "Geri yüklemeyi durdur", exact: true });
async function closeMobilePanel(page: Page) {
  if (page.viewportSize()!.width <= 760) await page.locator(".panel-zone [data-panel-close]").click();
}
async function release(page: Page, id: string) {
  await page.evaluate(id => {
    const state = window as unknown as RestoreWindow;
    state.heldLayers = state.heldLayers.filter(value => value !== id);
    state.releaseLayers[id]?.splice(0).forEach(resolve => resolve());
  }, id);
}

test("latest view owns camera, order and opacity even when an older layer finishes late", async ({ page }) => {
  const { a, b } = await prepare(page);
  await page.evaluate(a => { (window as unknown as RestoreWindow).heldLayers = [a]; }, a);
  await first(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(first(page)).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".bookmark-restore-status")).toContainText("Katmanlar geri yükleniyor");
  await expect.poll(() => page.evaluate(a => (window as unknown as RestoreWindow).restoreCalls.filter(call => call.id === a && call.visible).length, a)).toBe(1);
  await last(page).click();
  await release(page, a);
  await expect(page.locator(".toast-success")).toContainText("Son görünüm çalışma görünümü geri yüklendi");
  const state = await page.evaluate(() => {
    const state = window as unknown as RestoreWindow;
    return { navigation: state.navigation, opacity: state.sdkOpacity, order: state.sdkOrder, basemap: state.sdkBasemap, preferences: JSON.parse(localStorage.getItem("altyapi:preferences:v5")!) };
  });
  expect(state.navigation).toEqual([32.92]); expect(state.opacity[b]).toBe(0.8);
  expect(state.order.slice(0, 2)).toEqual([b, a]); expect(state.preferences.layerOrder.slice(0, 2)).toEqual([b, a]);
  expect(state.preferences.layerVisibility[a]).toBe(false); expect(state.preferences.layerVisibility[b]).toBe(true);
  expect(state.basemap).toBe("topo-vector"); await expect(stop(page)).toHaveCount(0);
  await expect(page.locator(".toast-success")).not.toContainText("İlk görünüm");
});

test("stop closes pending layers, preserves completed layers and restores keyboard focus", async ({ page }) => {
  const { a, b } = await prepare(page, true);
  await page.evaluate(b => { (window as unknown as RestoreWindow).heldLayers = [b]; }, b);
  await first(page).click();
  await expect.poll(() => page.evaluate(a => (window as unknown as RestoreWindow).sdkOpacity[a], a)).toBe(0.2);
  await stop(page).click(); await expect(first(page)).toBeFocused();
  await expect(page.locator(".bookmark-restore-status")).toBeEmpty();
  const visible = await page.evaluate(() => JSON.parse(localStorage.getItem("altyapi:preferences:v5")!).layerVisibility);
  expect(visible[a]).toBe(true); expect(visible[b]).toBe(false);
  await release(page, b);
  await expect.poll(() => page.evaluate(() => (window as unknown as RestoreWindow).restoreCompleted.length)).toBe(2);
  expect(await page.evaluate(() => (window as unknown as RestoreWindow).navigation)).toEqual([]);
  await first(page).click(); await expect(page.locator(".toast-success")).toContainText("İlk görünüm çalışma görünümü geri yüklendi");
  expect(await page.evaluate(() => (window as unknown as RestoreWindow).navigation)).toEqual([32.81]);
});

test("layer deadline releases the view and failures can be retried without false success", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const { a } = await prepare(page);
  await page.evaluate(a => { (window as unknown as RestoreWindow).heldLayers = [a]; }, a);
  await first(page).click(); await expect(first(page)).toHaveAttribute("aria-busy", "true");
  await page.clock.fastForward(60_001);
  await expect(page.locator(".toast-error")).toContainText("Görünüm katmanları zamanında tamamlanamadı");
  await expect(stop(page)).toHaveCount(0); await release(page, a);
  await expect.poll(() => page.evaluate(() => (window as unknown as RestoreWindow).restoreCompleted.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as RestoreWindow).navigation)).toEqual([]);
  await page.evaluate(a => { (window as unknown as RestoreWindow).failedLayers = [a]; }, a);
  await first(page).click();
  await expect(page.locator(".toast-info")).toContainText("1 katman geri yüklenemedi");
  await expect(page.locator(".toast-success").filter({ hasText: "çalışma görünümü geri yüklendi" })).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as RestoreWindow).failedLayers = []; });
  await first(page).click(); await expect(page.locator(".toast-success").filter({ hasText: "İlk görünüm çalışma görünümü geri yüklendi" })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("new selection cancels the SDK camera flight and navigation errors recover", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await prepare(page);
  await page.evaluate(() => { (window as unknown as RestoreWindow).cameraMode = "hold"; });
  await first(page).click(); await expect(page.locator(".bookmark-restore-status")).toContainText("Konuma geçiliyor");
  await last(page).click(); await expect(page.locator(".toast-success")).toContainText("Son görünüm çalışma görünümü geri yüklendi");
  await page.evaluate(() => (window as unknown as RestoreWindow).releaseCamera?.());
  expect(await page.evaluate(() => (window as unknown as RestoreWindow).navigation)).toEqual([32.92]);
  await page.evaluate(() => { (window as unknown as RestoreWindow).cameraMode = "fail"; });
  await first(page).click(); await expect(page.locator(".toast-error")).toContainText("Çalışma görünümü geri yüklenemedi");
  await expect(stop(page)).toHaveCount(0);
  await first(page).click(); await expect(page.locator(".toast-success").filter({ hasText: "İlk görünüm çalışma görünümü geri yüklendi" })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("camera timeout keeps completed layers and permits another attempt", async ({ page }) => {
  const { a } = await prepare(page);
  await page.evaluate(() => { (window as unknown as RestoreWindow).cameraMode = "hold"; });
  await first(page).click(); await expect(page.locator(".bookmark-restore-status")).toContainText("Konuma geçiliyor");
  await page.clock.fastForward(10_001);
  await expect(page.locator(".toast-error")).toContainText("Görünümün konumu zamanında tamamlanamadı");
  await expect(stop(page)).toHaveCount(0);
  expect(await page.evaluate(a => JSON.parse(localStorage.getItem("altyapi:preferences:v5")!).layerVisibility[a], a)).toBe(true);
  await page.evaluate(() => (window as unknown as RestoreWindow).releaseCamera?.());
  expect(await page.evaluate(() => (window as unknown as RestoreWindow).navigation)).toEqual([]);
  await first(page).click(); await expect(page.locator(".toast-success")).toContainText("İlk görünüm çalışma görünümü geri yüklendi");
});

test("a larger queued view keeps its adaptive budget and can still be stopped at the deadline", async ({ page }) => {
  const { a, b, c } = await prepare(page);
  await page.evaluate(({ a, b, c }) => {
    const preferences = JSON.parse(localStorage.getItem("altyapi:preferences:v5")!);
    preferences.bookmarks[0].layerIds = [a, b, c]; preferences.bookmarks[0].layerOrder = [a, b, c];
    localStorage.setItem("altyapi:preferences:v5", JSON.stringify(preferences));
  }, { a, b, c });
  await page.reload({ waitUntil: "domcontentloaded" }); await expect(page.locator(".boot-screen")).toHaveCount(0);
  await page.locator('[data-panel-target="bookmarks"]').click();
  await page.evaluate(ids => { (window as unknown as RestoreWindow).heldLayers = ids; }, [a, b, c]);
  await first(page).click(); await expect(first(page)).toHaveAttribute("aria-busy", "true");
  await page.clock.fastForward(60_001);
  await expect(first(page)).toHaveAttribute("aria-busy", "true"); await expect(stop(page)).toBeEnabled();
  await expect(page.locator(".toast-error")).toHaveCount(0);
  await page.clock.fastForward(30_000);
  await expect(page.locator(".toast-error")).toContainText("Görünüm katmanları zamanında tamamlanamadı");
  await expect(stop(page)).toHaveCount(0);
  for (const id of [a, b, c]) await release(page, id);
  expect(await page.evaluate(() => (window as unknown as RestoreWindow).navigation)).toEqual([]);
});

test("opacity and draw order edited during loading survive its late response", async ({ page }) => {
  const { a, b, bName } = await prepare(page, true);
  await page.evaluate(b => { (window as unknown as RestoreWindow).heldLayers = [b]; }, b);
  await first(page).click(); await expect(first(page)).toHaveAttribute("aria-busy", "true");
  await closeMobilePanel(page);
  await page.locator('[data-panel-target="layers"]').click();
  const card = page.locator(`.layer-card[data-service-id="${b}"]`);
  const opacity = card.getByRole("slider"); await opacity.focus(); await page.keyboard.press("Home");
  for (let step = 0; step < 7; step++) await page.keyboard.press("ArrowRight");
  await expect(opacity).toHaveValue("0.35");
  await page.locator(".advanced-layer-filters > summary").click(); await page.locator(".layer-stack-editor > summary").click();
  await page.getByRole("button", { name: `${bName} katmanını üste taşı`, exact: true }).click();
  await release(page, b); await expect(page.locator(".toast-success")).toContainText("İlk görünüm çalışma görünümü geri yüklendi");
  const state = await page.evaluate(() => {
    const state = window as unknown as RestoreWindow;
    return { opacity: state.sdkOpacity, order: state.sdkOrder, preferences: JSON.parse(localStorage.getItem("altyapi:preferences:v5")!) };
  });
  expect(state.opacity[b]).toBe(0.35); expect(state.preferences.layerOpacity[b]).toBe(0.35);
  expect(state.order.slice(0, 2)).toEqual([b, a]); expect(state.preferences.layerOrder.slice(0, 2)).toEqual([b, a]);
});

test("restore controls remain reachable on narrow, short and enlarged-text panels", async ({ page }, info) => {
  const { a } = await prepare(page);
  await page.evaluate(a => { (window as unknown as RestoreWindow).heldLayers = [a]; }, a);
  await first(page).click(); await expect(first(page)).toHaveAttribute("aria-busy", "true");
  for (const size of [{ width: 320, height: 640 }, { width: 760, height: 360 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size); await stop(page).scrollIntoViewIfNeeded(); await expect(stop(page)).toBeInViewport();
    const bounds = (await stop(page).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
    expect(await page.locator(".bookmarks-workspace").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`view-restore-${size.width}.png`), animations: "disabled", scale: "css" });
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await stop(page).scrollIntoViewIfNeeded(); await expect(stop(page)).toBeInViewport();
  expect(await page.locator(".bookmarks-controls").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("view-restore-enlarged-text.png"), animations: "disabled", scale: "css" });
  const search = page.getByRole("searchbox", { name: "Kayıtlı görünümlerde ara", exact: true });
  await search.fill("Son");
  await stop(page).click(); await expect(search).toBeFocused();
  await release(page, a); await expect(stop(page)).toHaveCount(0);
});

test("manual map navigation takes ownership before a pending saved view can move it", async ({ page }) => {
  const { a } = await prepare(page);
  await page.evaluate(a => { (window as unknown as RestoreWindow).heldLayers = [a]; }, a);
  await first(page).click(); await expect(first(page)).toHaveAttribute("aria-busy", "true");
  await closeMobilePanel(page);
  await page.locator('[data-command-target="home"]').click();
  await expect(stop(page)).toHaveCount(0); await release(page, a);
  await expect.poll(() => page.evaluate(() => (window as unknown as RestoreWindow).restoreCompleted.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as RestoreWindow).navigation)).toEqual([]);
  await page.evaluate(() => { (window as unknown as RestoreWindow).cameraMode = "hold"; });
  if (!await first(page).isVisible()) await page.locator('[data-panel-target="bookmarks"]').click();
  await first(page).click(); await expect(page.locator(".bookmark-restore-status")).toContainText("Konuma geçiliyor");
  await closeMobilePanel(page);
  const viewport = page.viewportSize()!;
  await page.mouse.click(viewport.width * 0.8, viewport.height * 0.3);
  await expect(stop(page)).toHaveCount(0);
  await page.evaluate(() => (window as unknown as RestoreWindow).releaseCamera?.());
  expect(await page.evaluate(() => (window as unknown as RestoreWindow).navigation)).toEqual([]);
});
