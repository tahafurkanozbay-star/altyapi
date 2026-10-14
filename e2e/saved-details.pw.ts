import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runtimeFixture } from "./runtimeFixture";

const detailFixture = runtimeFixture.replace(/attributes: \[[^\n]+\]/,
  "attributes: Array.from({length:48}, (_,i) => ({key:i===0?'İçme suyu birimi':i===47?'UzunAlanAdı'.repeat(12):'Alan '+i,value:i===0?'Kavaklıdere':i===47?'https://örnek.invalid/'+ 'uzundeğer'.repeat(80):'Öznitelik değeri '+i}))"
).replace("container.textContent = tool + ' aracı';", `
  container.replaceChildren();
  for(let i=0;i<30;i++) { const p=document.createElement('p'); p.textContent=tool+' aracı · satır '+i; container.append(p); }
  const button=document.createElement('button'); button.type='button'; button.textContent='Araç içerik sonu'; button.style.cssText='display:block;width:100%;min-height:44px;font:inherit'; container.append(button);
`);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    if (localStorage.getItem("altyapi:preferences:v5")) return;
    const camera = { longitude: 32.85, latitude: 39.92, z: 5200, heading: 2, tilt: 58 };
    const bookmarks = Array.from({ length: 40 }, (_, index) => ({
      id: "saved_" + index,
      name: index === 0 ? "İÇME SUYU Çankaya" : index === 1 ? "UzunGörünümAdı".repeat(8) : `Kayıt ${index + 1} – Mamak`,
      camera, layerIds: [], createdAt: "2026-10-13T07:00:00Z", basemap: "hybrid"
    }));
    localStorage.setItem("altyapi:preferences:v5", JSON.stringify({ bookmarks }));
  });
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: "text/javascript", body: detailFixture }));
  await page.route("https://**/*", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".boot-screen")).toHaveCount(0);
});

async function bookmarks(page: Page) {
  const close = page.locator(".panel-zone [data-panel-close]");
  if (await close.isVisible()) await close.click();
  await page.locator('[data-panel-target="bookmarks"]').click();
  await expect(page.locator(".bookmark-card")).toHaveCount(40);
}

async function details(page: Page) {
  const close = page.locator(".panel-zone [data-panel-close]");
  if (await close.isVisible()) await close.click();
  await page.locator("#kent-rehberi-map").click({ position: { x: Math.round(page.viewportSize()!.width * .75), y: 200 } });
  await expect(page.locator(".details-grid > div")).toHaveCount(48);
}

async function inViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function accessible(page: Page, selector: string) {
  const result = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
}

test("saved views search Turkish names and keep their controls above a long list", async ({ page }) => {
  await bookmarks(page);
  const search = page.getByRole("searchbox", { name: "Kayıtlı görünümlerde ara", exact: true });
  const before = await search.boundingBox();
  await page.locator(".bookmark-list").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator(".bookmark-main").last()).toBeInViewport();
  await inViewport(search, page);
  expect((await search.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await search.fill("içme");
  await expect(page.locator(".bookmark-card")).toHaveCount(1);
  await expect(page.locator(".bookmarks-count")).toHaveText("1 / 40 kayıtlı görünüm");
  await page.getByRole("button", { name: "Görünüm aramasını temizle", exact: true }).click();
  await expect(search).toBeFocused();
  await search.fill("bulunmayan görünüm");
  await expect(page.locator(".bookmark-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Aramayı temizle", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(page.locator(".bookmark-card")).toHaveCount(40);
  await accessible(page, ".operations-panel");
});

test("delete confirmation restores focus on cancel, Escape and successful deletion", async ({ page }) => {
  await bookmarks(page);
  const remove = page.getByRole("button", { name: "İÇME SUYU Çankaya kayıtlı görünümünü sil", exact: true });
  await remove.click();
  const cancel = page.getByRole("button", { name: "Silmekten vazgeç", exact: true });
  await expect(cancel).toBeFocused();
  await accessible(page, ".operations-panel");
  await page.keyboard.press("Escape");
  await expect(cancel).toHaveCount(0);
  await expect(remove).toBeFocused();
  await expect(page.locator(".operations-panel")).toBeVisible();
  await remove.click(); await cancel.click(); await expect(remove).toBeFocused();
  await remove.click(); await page.getByRole("button", { name: "Sil", exact: true }).click();
  await expect(page.locator(".bookmark-card")).toHaveCount(39);
  await expect(page.locator(".bookmark-main").first()).toBeFocused();
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem("altyapi:preferences:v5")!).bookmarks.map((b: { name: string }) => b.name));
  expect(names).not.toContain("İÇME SUYU Çankaya");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  const close = page.locator(".panel-zone [data-panel-close]");
  if (await close.isVisible()) await close.click();
  await page.locator('[data-panel-target="bookmarks"]').click();
  await expect(page.locator(".bookmark-card")).toHaveCount(39);
});

test("deleting the only matching view returns to search and deleting the final view returns to save", async ({ page }) => {
  await bookmarks(page);
  const search = page.getByRole("searchbox", { name: "Kayıtlı görünümlerde ara", exact: true });
  await search.fill("içme");
  await page.getByRole("button", { name: "İÇME SUYU Çankaya kayıtlı görünümünü sil", exact: true }).click();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page.locator(".bookmarks-count")).toHaveText("0 / 39 kayıtlı görünüm");
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem("altyapi:preferences:v5")!);
    preferences.bookmarks = preferences.bookmarks.slice(0, 1);
    localStorage.setItem("altyapi:preferences:v5", JSON.stringify(preferences));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  const close = page.locator(".panel-zone [data-panel-close]");
  if (await close.isVisible()) await close.click();
  await page.locator('[data-panel-target="bookmarks"]').click();
  await page.locator(".bookmark-card > .is-danger").click();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bu çalışma görünümünü kaydet", exact: true })).toBeFocused();
  await expect(page.locator(".bookmark-card")).toHaveCount(0);
  await expect(page.locator(".bookmarks-count")).toHaveText("0 / 0 kayıtlı görünüm");
});

test("saving a new view clears the previous search and the dialog remains usable at 200 percent text size", async ({ page }) => {
  await bookmarks(page);
  const search = page.getByRole("searchbox", { name: "Kayıtlı görünümlerde ara", exact: true });
  const size = await search.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await search.fill("içme");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect.poll(() => search.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(size * 1.95);
  await page.getByRole("button", { name: "Bu çalışma görünümünü kaydet", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bu görünümü kaydet", exact: true });
  const input = dialog.getByRole("textbox", { name: "Görünüm adı", exact: true });
  await expect(input).toBeFocused();
  await expect.poll(() => input.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(32);
  await input.fill("   ");
  await expect(dialog.getByRole("button", { name: "Görünümü kaydet", exact: true })).toBeDisabled();
  await input.fill("  Yeni   inceleme  ");
  const save = dialog.getByRole("button", { name: "Görünümü kaydet", exact: true });
  await save.scrollIntoViewIfNeeded();
  await inViewport(save, page);
  await inViewport(dialog.getByRole("button", { name: "Pencereyi kapat", exact: true }), page);
  expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await accessible(page, ".workspace-dialog");
  await page.screenshot({ path: test.info().outputPath("save-large-text.png"), animations: "disabled", scale: "css" });
  await save.click();
  await expect(dialog).not.toBeVisible();
  await expect(search).toHaveValue("");
  await expect(page.locator(".bookmark-main").first()).toContainText("Yeni inceleme");
  await expect(page.locator(".bookmark-card")).toHaveCount(40);
  const name = await page.evaluate(() => JSON.parse(localStorage.getItem("altyapi:preferences:v5")!).bookmarks[0].name);
  expect(name).toBe("Yeni inceleme");
  expect(await page.locator(".bookmark-list").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
});

test("detail search and close stay pinned while long attributes scroll and empty search can recover", async ({ page }) => {
  await details(page);
  const search = page.getByRole("searchbox", { name: "Özniteliklerde ara", exact: true });
  const before = await search.boundingBox();
  const region = page.getByRole("region", { name: "Nesne öznitelikleri", exact: true });
  await region.focus(); await page.keyboard.press("End");
  await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator(".details-grid > div").last()).toBeInViewport();
  expect((await search.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await inViewport(page.getByRole("button", { name: "Detayları kapat", exact: true }), page);
  expect(await region.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await search.fill("İÇME");
  await expect(page.locator(".details-grid > div")).toHaveCount(1);
  await page.getByRole("button", { name: "Öznitelik aramasını temizle", exact: true }).click();
  await expect(search).toBeFocused();
  await search.fill("bulunmayan alan");
  await page.getByRole("button", { name: "Aramayı temizle", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page.locator(".details-grid > div")).toHaveCount(48);
  const size = await search.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect.poll(() => search.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(size * 1.95);
  await accessible(page, ".details-drawer");
  await page.screenshot({ path: test.info().outputPath("details-large-text.png"), animations: "disabled", scale: "css" });
  await page.getByRole("button", { name: "Detayları kapat", exact: true }).click();
  await expect(page.locator(".details-drawer")).toHaveCount(0);
});

test("tool guidance and controls share keyboard scrolling while close stays visible at large text size", async ({ page }) => {
  const close = page.locator(".panel-zone [data-panel-close]");
  if (await close.isVisible()) await close.click();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.locator('[data-tool-target="area"]').click();
  const body = page.locator(".map-tool-body");
  const end = body.getByRole("button", { name: "Araç içerik sonu", exact: true });
  await expect(end).toHaveCount(1);
  await body.focus(); await page.keyboard.press("End");
  await expect(end).toBeInViewport();
  const dismiss = page.locator(".map-tool-header button");
  await inViewport(dismiss, page);
  expect(await body.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.locator(".map-tool-guidance").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(26);
  await accessible(page, ".map-tool-panel");
  await page.setViewportSize({ width: 320, height: 640 });
  await end.scrollIntoViewIfNeeded();
  await expect(end).toBeInViewport();
  await inViewport(dismiss, page);
  expect(await body.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await dismiss.click(); await expect(page.locator(".map-tool-panel")).toHaveCount(0);
});
