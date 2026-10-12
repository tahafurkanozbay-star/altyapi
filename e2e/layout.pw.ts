import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runtimeFixture } from "./runtimeFixture";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, (route) => route.fulfill({ contentType: "text/javascript", body: runtimeFixture }));
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".boot-screen")).toHaveCount(0);
});

async function openLayers(page: Page) {
  if (await page.locator(".main-panel").isVisible()) return;
  if (page.viewportSize()!.width <= 760) await page.locator(".mobile-menu").click();
  else await page.locator('[data-panel-target="layers"]').click();
  await expect(page.locator(".main-panel")).toBeVisible();
}

async function closePanel(page: Page) {
  if (await page.locator(".panel-zone [data-panel-close]").isVisible()) {
    await page.locator(".panel-zone [data-panel-close]").click();
  }
}

async function insideViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

test("search stays pinned while layer controls and all rail tools stay reachable", async ({ page }) => {
  await openLayers(page);
  const search = page.getByRole("searchbox", { name: "Katman veya kurum ara" });
  const before = (await search.boundingBox())!;
  const lastCard = page.locator(".layer-card").last();
  await lastCard.locator('.icon-ghost[aria-expanded]').click();
  await expect(lastCard.locator(".layer-info-box")).toBeVisible();
  const after = (await search.boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  const close = page.locator(".main-panel [data-panel-close]");
  await expect(close).toBeInViewport();
  if (page.viewportSize()!.width <= 760) {
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".main-panel :focus")).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("details:not([open])")))).toBe(false);
  }
  const controlSizes = await lastCard.locator("button").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  for (const size of controlSizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  await close.click();
  await expect(page.locator("#kent-rehberi-tools")).not.toHaveAttribute("inert", "");
  const layersTrigger = page.locator('[data-panel-target="layers"]');
  await layersTrigger.focus();
  await expect(layersTrigger).toBeFocused();
  await page.keyboard.press("End");
  const help = page.locator('[data-panel-target="help"]');
  await expect(help).toBeFocused();
  await expect(help).toBeInViewport();
  await help.click();
  await expect(page.locator(".help-body")).toBeVisible();
});

test("drawers never cover header or dock across narrow, landscape and desktop sizes", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 640 }, { width: 760, height: 360 }, { width: 1024, height: 640 }, { width: 1440, height: 900 }]) {
    await closePanel(page);
    await page.setViewportSize(viewport);
    await openLayers(page);
    await insideViewport(page.locator(".topbar"), page);
    await expect(page.getByRole("textbox", { name: "Adres veya yer ara", exact: true })).toBeVisible();
    await insideViewport(page.locator(".main-panel"), page);
    await insideViewport(page.locator(".tool-rail"), page);
    const header = (await page.locator(".topbar").boundingBox())!;
    const panel = (await page.locator(".main-panel").boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(header.y + header.height + 4);
    if (viewport.width <= 760) {
      const dock = (await page.locator(".tool-rail").boundingBox())!;
      expect(panel.y + panel.height).toBeLessThanOrEqual(dock.y - 4);
    }
    const overflow = await page.locator(".layer-explorer-header").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (viewport.width === 320) {
      const firstCard = (await page.locator(".layer-card").first().boundingBox())!;
      expect(firstCard.y).toBeLessThan(panel.y + panel.height - 24);
    }
    await page.locator(".layer-explorer-body").evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: test.info().outputPath(`layout-${viewport.width}-${viewport.height}.png`), animations: "disabled", scale: "css" });
  }
});

test("loaded data is readable, searchable and scrollable by keyboard without panel overflow", async ({ page }) => {
  await closePanel(page);
  await page.locator('[data-panel-target="data"]').click();
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click();
  const table = page.getByRole("region", { name: "Öznitelik sonuç tablosu" });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await table.focus();
  await expect(table).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const overflow = await page.locator(".operations-body").evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("textbox", { name: "Bu sayfada hızlı ara", exact: true }).fill("Ankara");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  const accessibility = await new AxeBuilder({ page }).include(".operations-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("loaded-data.png"), animations: "disabled", scale: "css" });
});

test("compact workspaces show one surface and focus mode restores the retained panel", async ({ page }) => {
  await closePanel(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLayers(page);
  await page.locator('[data-tool-target="legend"]').click();
  await expect(page.locator(".main-panel")).toBeVisible();
  await insideViewport(page.locator(".map-tool-panel"), page);
  const panel = (await page.locator(".main-panel").boundingBox())!;
  const tool = (await page.locator(".map-tool-panel").boundingBox())!;
  expect(tool.x).toBeGreaterThan(panel.x + panel.width);
  await page.setViewportSize({ width: 820, height: 900 });
  await expect(page.locator(".main-panel")).toHaveCount(0);
  await openLayers(page);
  await expect(page.locator(".map-tool-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Haritaya odaklan", exact: true }).click();
  await expect(page.locator(".main-panel")).not.toBeVisible();
  await expect(page.locator(".panel-zone")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.locator(".main-panel")).toBeVisible();
  await page.getByRole("button", { name: "Haritaya odaklan", exact: true }).click();
  await page.locator('[data-panel-target="layers"]').click();
  await expect(page.locator(".main-panel")).toBeVisible();
  await expect(page.locator(".app-shell")).not.toHaveClass(/is-focus-mode/);
});

test("object details and native save dialogs fit the viewport and keep close controls reachable", async ({ page }) => {
  await closePanel(page);
  await page.locator("#kent-rehberi-map").click({ position: { x: Math.round(page.viewportSize()!.width / 2), y: 200 } });
  await insideViewport(page.locator(".details-drawer"), page);
  await expect(page.locator(".details-grid")).toContainText("Kavaklıdere");
  await page.getByRole("button", { name: "Detayları kapat", exact: true }).click();
  await page.locator('[data-panel-target="bookmarks"]').click();
  await page.getByRole("button", { name: "Bu çalışma görünümünü kaydet", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bu görünümü kaydet", exact: true });
  await insideViewport(dialog, page);
  await expect(dialog.getByRole("textbox", { name: "Görünüm adı", exact: true })).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).include(".workspace-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map((violation) => violation.id)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("save-dialog.png"), animations: "disabled", scale: "css" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Bu çalışma görünümünü kaydet", exact: true })).toBeFocused();
});
