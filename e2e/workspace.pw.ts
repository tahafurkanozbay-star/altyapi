import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runtimeFixture } from "./runtimeFixture";

test.beforeEach(async ({ page }) => {
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, (route) => route.fulfill({ contentType: "text/javascript", body: runtimeFixture }));
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".boot-screen")).toHaveCount(0);
});

async function layers(page: import("@playwright/test").Page) {
  await expect(page.locator(".app-shell")).toBeVisible();
  if (!(await page.locator(".main-panel").isVisible())) {
    if (await page.locator(".main-panel").count()) await page.locator(".mobile-menu").click();
    else await page.getByRole("button", { name: "Katmanlar", exact: true }).click();
  }
}

test("readable shell, map access and keyboard-safe panels", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (info.project.name === "mobile") {
    await expect(page.locator(".main-panel")).not.toBeVisible();
    await expect(page.locator("#kent-rehberi-map")).not.toHaveAttribute("inert", "");
  }
  await layers(page);
  await expect(page.locator(".layer-card")).toHaveCount(10);
  await page.getByRole("searchbox", { name: "Katman veya kurum ara" }).fill("DOĞALGAZ HATTI");
  await expect(page.locator(".layer-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Filtreleri temizle" }).click();
  await expect(page.locator(".layer-card")).toHaveCount(10);
  const panel = await page.locator(".main-panel").boundingBox();
  const viewport = page.viewportSize()!;
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height);
  await page.locator(".layer-explorer-body").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath("layers.png"), animations: "disabled" });
  const accessibility = await new AxeBuilder({ page }).include(".app-shell").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
  await page.getByRole("button", { name: "Katmanlar panelini kapat", exact: true }).click();
  await expect(page.locator(".main-panel")).toHaveCount(0);
  if (info.project.name === "mobile") await page.locator(".mobile-menu").click();
  else await page.getByRole("button", { name: "Katmanlar", exact: true }).click();
  await expect(page.locator(".main-panel")).toBeVisible();
  expect(errors).toEqual([]);
});

test("search groups can be collapsed and clearing filters restores search focus", async ({ page }) => {
  await layers(page);
  const search = page.getByRole("searchbox", { name: "Katman veya kurum ara" });
  await search.fill("DOĞALGAZ HATTI");
  await expect(page.locator(".layer-card")).toHaveCount(2);

  const heading = page.locator(".layer-group .group-heading").first();
  await expect(heading).toHaveAttribute("aria-expanded", "true");
  await heading.click();
  await expect(heading).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".layer-card")).toHaveCount(0);
  await heading.click();
  await expect(page.locator(".layer-card")).toHaveCount(2);

  // A new query begins with matching groups expanded instead of inheriting
  // the previous search's collapsed-state choices.
  await heading.click();
  await search.fill("YAĞMUR");
  await expect(page.locator(".layer-group .group-heading").first()).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".layer-card").first()).toBeVisible();

  await page.getByRole("button", { name: "Aramayı temizle" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await search.fill("bulunmayan-katman");
  await expect(page.locator(".empty-state")).toContainText("Katman bulunamadı");
  await page.getByRole("button", { name: "Tüm katmanları göster" }).click();
  await expect(search).toBeFocused();
  await expect(page.locator(".layer-card")).toHaveCount(10);

  await search.fill("DOĞALGAZ HATTI");
  await page.getByRole("button", { name: "Filtreleri temizle" }).click();
  await expect(search).toBeFocused();

  const initialGroupSize = await heading.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize));
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect.poll(() => heading.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(initialGroupSize * 1.8);
  await expect.poll(() => search.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(20);
  const accessibility = await new AxeBuilder({ page }).include(".layer-explorer").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
});

test("a pending layer can be cancelled and stays closed after its response", async ({ page }) => {
  await layers(page);
  const card = page.locator(".layer-card").filter({ hasText: "YAĞMUR" }).first();
  const toggle = card.locator(".visibility-button");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(900);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(card).not.toHaveClass(/status-loading/);
});

test("bookmarks, native dialog, data and every map tool remain usable", async ({ page }) => {
  await layers(page);
  await page.getByRole("button", { name: "Katmanlar panelini kapat", exact: true }).click();
  await page.getByRole("button", { name: "Yer imleri", exact: true }).click();
  await page.getByRole("button", { name: "Bu çalışma görünümünü kaydet" }).click();
  const dialog = page.getByRole("dialog", { name: "Bu görünümü kaydet" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Görünüm adı" }).fill("Çankaya inceleme");
  await dialog.getByRole("button", { name: "Görünümü kaydet", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".bookmark-main")).toContainText("Çankaya inceleme");
  await page.locator(".operations-heading [data-panel-close]").click();
  await page.getByRole("button", { name: "Harita verisi", exact: true }).click();
  await expect(page.locator(".data-workbench")).toBeVisible();
  await page.locator(".operations-heading [data-panel-close]").click();
  for (const tool of ["legend", "basemap", "distance", "area", "daylight", "slice", "lineOfSight", "elevation"]) {
    await page.locator(`[data-tool-target="${tool}"]`).click();
    await expect(page.locator(".map-tool-host")).toContainText(tool);
    await page.locator(".map-tool-header button").click();
    await expect(page.locator(".map-tool-panel")).toHaveCount(0);
  }
});

test("local SDK assets and authorized-access dialog work without the SDK CDN", async ({ page }) => {
  for (const asset of [
    "/sdk-assets/core/esri/core/workers/RemoteClient.js",
    "/sdk-assets/map/assets/search/t9n/messages.tr.json",
    "/sdk-assets/calcite/assets/icon/x24.json"
  ]) {
    const response = await page.request.get(asset);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).not.toContain("text/html");
  }
  await page.getByRole("button", { name: "TUCBS yetkili servis bağlantısını tanımla", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "TUCBS yetkili erişimi" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Servis JSON içeriği" }).fill("geçersiz json");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("failed map tools explain recovery and can be retried", async ({ page }, info) => {
  const recoveringFixture = runtimeFixture.replace("container.textContent = tool + ' aracı';", "if (tool === 'area' && !this.retried) { this.retried = true; throw new Error('temporary tool failure'); } container.textContent = tool + ' aracı';");
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, (route) => route.fulfill({ contentType: "text/javascript", body: recoveringFixture }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  await layers(page);
  if (info.project.name !== "tablet") await page.getByRole("button", { name: "Katmanlar panelini kapat", exact: true }).click();
  await page.locator('[data-tool-target="area"]').click();
  await expect(page.locator(".main-panel")).toHaveCount(0);
  await expect(page.locator(".map-tool-panel")).toHaveAttribute("data-tool-state", "error");
  await expect(page.locator(".map-tool-error")).toContainText("Bağlantınızı kontrol");
  await expect(page.locator(".map-tool-guidance")).toContainText("köşelerini");
  const accessibility = await new AxeBuilder({ page }).include(".map-tool-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map((violation) => violation.id)).toEqual([]);
  const bounds = await page.locator(".map-tool-panel").boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  if (info.project.name === "mobile") {
    const footer = await page.locator(".status-bar").boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footer!.y);
  }
  await page.screenshot({ path: info.outputPath("tool-recovery.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Aracı yeniden dene", exact: true }).click();
  await expect(page.locator(".map-tool-panel")).toHaveAttribute("data-tool-state", "ready");
  await expect(page.locator(".map-tool-host")).toContainText("area aracı");
  await page.locator(".map-tool-header button").click();
  await expect(page.locator(".map-tool-panel")).toHaveCount(0);
});


test("slow module loading stays informative and real startup failures can recover", async ({ page }) => {
  const mainModule = /\/src\/main\.tsx(?:\?.*)?$/;
  await page.route(mainModule, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.continue();
  });
  const navigation = page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Hazırlık beklenenden uzun sürüyor.", { exact: false })).toBeVisible();
  await expect(page.locator(".static-boot-error")).toHaveCount(0);
  await navigation;
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.unroute(mainModule);
  await page.route(mainModule, (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".static-boot-error")).toContainText("Harita kaynakları yüklenemedi");
  const accessibility = await new AxeBuilder({ page }).include(".static-boot-error").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map((violation) => violation.id)).toEqual([]);
  await page.unroute(mainModule);
  await page.getByRole("button", { name: "Sayfayı yeniden yükle", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
});
