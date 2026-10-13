import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { queryFixture, mode, requests } from "./attributeFixture";

const rows = (page: Page) => page.locator(".attribute-table tbody tr");

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: "text/javascript", body: queryFixture }));
  await page.route("https://**/*", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  await page.locator('[data-panel-target="data"]').click();
  await expect(page.getByRole("button", { name: "Veriyi getir", exact: true })).toBeEnabled();
});

test("query cancellation is immediate, accessible and also runs when its panel closes", async ({ page }) => {
  await mode(page, "hold"); await page.getByRole("button", { name: "Veriyi getir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sorguyu durdur", exact: true })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include(".operations-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map(v => v.id)).toEqual([]);
  await page.getByRole("button", { name: "Sorguyu durdur", exact: true }).click();
  await expect(page.locator(".data-query-notice")).toHaveText("Sorgu durduruldu.");
  expect((await requests(page))[0]!.aborted).toBe(true);
  await expect(page.locator(".data-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click(); await expect(rows(page)).toHaveCount(100);
  await mode(page, "hold"); await page.getByRole("button", { name: "Veriyi getir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sorguyu durdur", exact: true })).toBeVisible();
  await page.locator(".panel-zone [data-panel-close]").click();
  await expect.poll(async () => (await requests(page)).at(-1)!.aborted).toBe(true);
  await page.locator('[data-panel-target="data"]').click(); await expect(rows(page)).toHaveCount(0);
});

test("changing the layer cancels the previous request and ignores its late success", async ({ page }) => {
  await mode(page, "late"); await page.getByRole("button", { name: "Veriyi getir", exact: true }).click();
  await expect.poll(async () => (await requests(page)).length).toBe(1);
  const select = page.getByRole("combobox", { name: "Katman", exact: true });
  const next = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(next!); expect((await requests(page))[0]!.aborted).toBe(true);
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click(); await expect(rows(page)).toHaveCount(100);
  await expect.poll(async () => (await requests(page))[0]!.finished).toBe(true);
  await expect(select).toHaveValue(next!);
  const caption = await select.locator("option:checked").innerText();
  await expect(page.locator(".attribute-table caption")).toContainText(caption.split(" · ")[0]!);
  await expect(page.locator(".data-error")).toHaveCount(0);
});

test("a failed filter keeps the last successful table and its pagination query", async ({ page }) => {
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click(); await expect(rows(page)).toHaveCount(100);
  await page.locator(".server-query-heading").click();
  await page.getByRole("combobox", { name: "Alan", exact: true }).selectOption("id");
  await page.getByRole("textbox", { name: "Değer", exact: true }).fill("5");
  await mode(page, "fail"); await page.getByRole("button", { name: "Sorguyu uygula", exact: true }).click();
  await expect(page.locator(".data-error")).toContainText("Deneme sorgusu reddedildi.");
  await expect(page.locator(".query-active-badge")).toHaveCount(0); await expect(rows(page)).toHaveCount(100);
  await page.getByRole("button", { name: "Sonraki ›", exact: true }).click();
  await expect(page.locator(".data-pagination")).toContainText("101–200 / 205");
  expect((await requests(page)).at(-1)!.options.filter).toBeUndefined();
});

test("page size restarts at the first page and cancellation restores consistent controls", async ({ page }) => {
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click(); await expect(rows(page)).toHaveCount(100);
  const size = page.getByRole("combobox", { name: "Sayfa boyutu", exact: true });
  await size.selectOption("50"); await expect(rows(page)).toHaveCount(50);
  expect((await requests(page)).at(-1)!.options).toMatchObject({ offset: 0, limit: 50 });
  await page.getByRole("button", { name: "Sonraki ›", exact: true }).click();
  await expect(page.locator(".data-pagination")).toContainText("51–100 / 205");
  expect((await requests(page)).at(-1)!.options).toMatchObject({ offset: 50, limit: 50 });
  await mode(page, "hold"); await size.selectOption("250");
  await expect(page.getByRole("button", { name: "Sorguyu durdur", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /CSV olarak indir/ })).toBeDisabled();
  await page.getByRole("button", { name: "Sorguyu durdur", exact: true }).click();
  await expect(size).toHaveValue("50"); await expect(rows(page)).toHaveCount(50);
  await expect(page.locator(".data-pagination")).toContainText("51–100 / 205");
});

test("changing page size replaces a pending query and keeps its late result out of the table", async ({ page }) => {
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click(); await expect(rows(page)).toHaveCount(100);
  const size = page.getByRole("combobox", { name: "Sayfa boyutu", exact: true });
  await mode(page, "late"); await size.selectOption("250");
  await expect(page.getByRole("button", { name: "Sorguyu durdur", exact: true })).toBeVisible();
  await size.selectOption("50"); await expect(rows(page)).toHaveCount(50);
  await expect.poll(async () => (await requests(page))[1]!.finished).toBe(true);
  expect((await requests(page))[1]!.aborted).toBe(true);
  expect((await requests(page)).at(-1)!.options).toMatchObject({ offset: 0, limit: 50 });
  await expect(size).toHaveValue("50");
  await expect(page.locator(".data-pagination")).toContainText("1–50 / 205");
  await expect(rows(page)).toHaveCount(50);
  await expect(page.locator(".data-error")).toHaveCount(0);
});
