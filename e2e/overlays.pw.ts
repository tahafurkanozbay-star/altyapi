import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runtimeFixture } from "./runtimeFixture";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const nativeViewport = window.visualViewport;
    let visibleHeight: number | null = null;
    const viewport = Object.assign(new EventTarget(), {
      offsetTop: 0, offsetLeft: 0, scale: 1,
      pageTop: 0, pageLeft: 0
    });
    Object.defineProperties(viewport, {
      width: { get: () => nativeViewport?.width ?? innerWidth },
      height: { get: () => visibleHeight ?? nativeViewport?.height ?? innerHeight }
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    Object.assign(window, {
      setTestViewport(height: number, offsetTop = 0) {
        visibleHeight = height;
        Object.assign(viewport, { offsetTop, pageTop: offsetTop });
        viewport.dispatchEvent(new Event("resize"));
      }
    });
  });
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, (route) => route.fulfill({ contentType: "text/javascript", body: runtimeFixture }));
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".boot-screen")).toHaveCount(0);
});

async function closePanel(page: Page) {
  const close = page.locator(".panel-zone [data-panel-close]");
  if (await close.isVisible()) await close.click();
  await expect(page.locator("#kent-rehberi-notices")).not.toHaveAttribute("inert", "");
}

async function setVisibleViewport(page: Page, height: number, offsetTop = 0) {
  await page.evaluate(({ height, offsetTop }) => {
    (window as typeof window & { setTestViewport: (height: number, offsetTop: number) => void }).setTestViewport(height, offsetTop);
  }, { height, offsetTop });
  await expect(page.locator("html")).toHaveAttribute("data-virtual-keyboard", height < page.viewportSize()!.height - 120 ? "open" : "closed");
}

async function withinVisibleViewport(locator: Locator, height: number, top = 0) {
  await expect(locator).toBeVisible();
  await expect.poll(async () => {
    const box = (await locator.boundingBox())!;
    return box.y >= top - 1 && box.y + box.height <= top + height + 1;
  }).toBe(true);
}

async function offerNotices(page: Page) {
  await page.evaluate(async () => {
    const { publishRuntimeEvent } = await import(new URL("/src/platform/runtimeEvents.ts", location.origin).href);
    publishRuntimeEvent("pwa-update-available", { source: "waiting" });
    publishRuntimeEvent("app-runtime-fault", { source: "service-worker", message: "Örnek bağlantı kesintisi", reloadRecommended: false });
    const prompt = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" })
    });
    window.dispatchEvent(prompt);
  });
}

test("simultaneous notices flow without overlap and dismiss independently", async ({ page }) => {
  await closePanel(page);
  await offerNotices(page);
  await page.context().setOffline(true);
  const host = page.locator("#kent-rehberi-notices");
  await expect(host.locator(".offline-banner")).toBeVisible();
  await expect(host.locator(".platform-update-banner")).toBeVisible();
  await expect(host.locator(".runtime-fault-banner")).toBeVisible();
  await expect(host.locator(".install-banner")).toBeVisible();
  await expect(host.locator(".toast")).toContainText("İnternet bağlantısı kesildi");
  const cards = host.locator(".offline-banner, .platform-update-banner, .runtime-fault-banner, .install-banner, .toast");
  const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, width: box.width };
  }).sort((a, b) => a.top - b.top));
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index]!.top).toBeGreaterThanOrEqual(boxes[index - 1]!.bottom + 6);
  }
  const hostBox = (await host.boundingBox())!;
  const headerBox = (await page.locator(".topbar").boundingBox())!;
  expect(hostBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(hostBox.y + hostBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await host.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await host.getByRole("button", { name: "Hata bildirimini kapat" }).click();
  await expect(host.locator(".runtime-fault-banner")).toHaveCount(0);
  await expect(host.locator(".platform-update-banner")).toBeVisible();
  await host.getByRole("button", { name: "Yükleme önerisini kapat" }).click();
  await expect(host.locator(".install-banner")).toHaveCount(0);
  const accessibility = await new AxeBuilder({ page }).include("#kent-rehberi-notices").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("notices.png"), animations: "disabled", scale: "css" });
});

test("mobile modal preserves queued notices and restores their controls on dismissal", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile modal isolation");
  await closePanel(page);
  await page.locator(".mobile-menu").click();
  await expect(page.locator("#kent-rehberi-notices")).toHaveAttribute("inert", "");
  await offerNotices(page);
  await expect(page.locator(".platform-update-banner")).toBeHidden();
  await page.getByRole("searchbox", { name: "Katman veya kurum ara" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".main-panel :focus")).toBeVisible();
  await closePanel(page);
  await expect(page.locator(".platform-update-banner")).toBeVisible();
  await page.getByRole("button", { name: "Güncelleme bildirimini kapat" }).click();
  await expect(page.locator(".platform-update-banner")).toHaveCount(0);
});

test("keyboard shrink and viewport panning keep search and panel controls visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Virtual keyboard geometry");
  await page.locator(".mobile-menu").click();
  const search = page.getByRole("searchbox", { name: "Katman veya kurum ara" });
  await search.focus();
  for (const top of [0, 30]) {
    await setVisibleViewport(page, 380, top);
    await withinVisibleViewport(page.locator(".main-panel"), 380, top);
    await withinVisibleViewport(search, 380, top);
    await withinVisibleViewport(page.locator(".main-panel [data-panel-close]"), 380, top);
    await search.fill("imar");
    await expect(page.locator(".layer-card").first()).toBeVisible();
    const header = (await page.locator(".topbar").boundingBox())!;
    const panel = (await page.locator(".main-panel").boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(header.y + header.height + 4);
    const address = (await page.getByRole("textbox", { name: "Adres veya yer ara", exact: true }).boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(address.y + address.height + 4);
  }
  await page.screenshot({ path: test.info().outputPath("keyboard-panel.png"), animations: "disabled", scale: "css" });
  await setVisibleViewport(page, page.viewportSize()!.height);
  await withinVisibleViewport(page.locator(".tool-rail"), page.viewportSize()!.height);
  await withinVisibleViewport(page.locator(".main-panel"), page.viewportSize()!.height);
});

test("save dialog follows the keyboard viewport and keeps submission reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Native dialog keyboard geometry");
  await closePanel(page);
  await page.locator('[data-panel-target="bookmarks"]').click();
  await page.getByRole("button", { name: "Bu çalışma görünümünü kaydet", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bu görünümü kaydet", exact: true });
  await setVisibleViewport(page, 380, 30);
  await withinVisibleViewport(dialog, 380, 30);
  await dialog.getByRole("textbox", { name: "Görünüm adı", exact: true }).fill("Mobil görünüm");
  await withinVisibleViewport(dialog.getByRole("button", { name: "Görünümü kaydet", exact: true }), 380, 30);
  await dialog.getByRole("button", { name: "Görünümü kaydet", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await setVisibleViewport(page, page.viewportSize()!.height);
  await expect(page.locator(".bookmark-main")).toContainText("Mobil görünüm");
});

test("authorized access dialog fits the screen and exposes readable validation errors", async ({ page }, testInfo) => {
  await closePanel(page);
  await page.evaluate(async () => {
    const { publishRuntimeEvent } = await import(new URL("/src/platform/runtimeEvents.ts", location.origin).href);
    publishRuntimeEvent("tucbs-access-setup-requested", {});
  });
  const dialog = page.getByRole("dialog", { name: "TUCBS yetkili erişimi", exact: true });
  if (testInfo.project.name === "mobile") await setVisibleViewport(page, 380, 30);
  const height = testInfo.project.name === "mobile" ? 380 : page.viewportSize()!.height;
  const top = testInfo.project.name === "mobile" ? 30 : 0;
  await withinVisibleViewport(dialog.locator(".tucbs-access-dialog"), height, top);
  await dialog.getByRole("textbox", { name: "Servis JSON içeriği" }).fill("geçersiz json");
  await dialog.getByRole("button", { name: "Bağlantıyı etkinleştir" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await withinVisibleViewport(dialog.getByRole("button", { name: "Kapat", exact: true }), height, top);
  const accessibility = await new AxeBuilder({ page }).include(".tucbs-access-native").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("access-dialog.png"), animations: "disabled", scale: "css" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
