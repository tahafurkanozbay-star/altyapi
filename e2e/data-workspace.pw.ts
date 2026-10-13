import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AttributeQueryOptions, AttributeTableResult, ServiceDefinition } from "../src/types";
import { runtimeFixture } from "./runtimeFixture";

interface QueryBoundary {
  requests: AttributeQueryOptions[];
  failNext: boolean;
  holdNext: boolean;
  release?: () => void;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const boundary: QueryBoundary = { requests: [], failNext: false, holdNext: false };
    Object.assign(window, {
      queryBoundary: boundary,
      async queryWorkspace(service: ServiceDefinition, options: AttributeQueryOptions): Promise<AttributeTableResult> {
        boundary.requests.push(structuredClone(options));
        if (boundary.holdNext) {
          boundary.holdNext = false;
          await new Promise<void>((resolve) => { boundary.release = resolve; });
        }
        if (boundary.failNext) {
          boundary.failNext = false;
          throw new Error("Örnek geçici servis hatası");
        }
        const fields = [
          { name: "id", alias: "Kimlik", type: "oid" },
          { name: "ilce", alias: "İlçe", type: "string" },
          { name: "aciklama", alias: "Uzun açıklama ve inceleme bilgisi", type: "string" }
        ];
        let rows = Array.from({ length: 130 }, (_, index) => ({ id: index + 1, ilce: index % 2 ? "Mamak" : "Çankaya", aciklama: `Kayıt ${index + 1}` }));
        if (options.filter) rows = rows.filter((row) => String(row[options.filter!.field as keyof typeof row]) === options.filter!.value);
        if (options.orderBy?.direction === "desc") rows.reverse();
        const total = rows.length;
        return {
          serviceId: service.id, serviceName: service.displayName, fields,
          rows: rows.slice(options.offset, options.offset + options.limit), total,
          offset: options.offset, limit: options.limit, truncated: total > options.limit,
          hasPrevious: options.offset > 0, hasNext: options.offset + options.limit < total,
          objectIdField: "id", where: options.filter ? `${options.filter.field} = '${options.filter.value}'` : "1=1",
          ...(options.orderBy ? { orderBy: `${options.orderBy.field} ${options.orderBy.direction.toUpperCase()}` } : {}),
          fetchedAt: new Date().toISOString()
        };
      }
    });
  });
  const transport = runtimeFixture.replace("async queryAttributes(service, options) {", "async queryAttributes(service, options) { return window.queryWorkspace(service, options);");
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, (route) => route.fulfill({ contentType: "text/javascript", body: transport }));
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  const close = page.locator(".panel-zone [data-panel-close]");
  if (await close.isVisible()) await close.click();
  await expect(page.locator("#kent-rehberi-tools")).not.toHaveAttribute("inert", "");
  await page.locator('[data-panel-target="data"]').click();
  await expect(page.locator(".data-workbench")).toBeVisible();
});

async function loadData(page: Page) {
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click();
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(100);
}

async function openQuery(page: Page) {
  await page.locator(".server-query-studio > summary").click();
  await expect(page.getByRole("combobox", { name: "Sırala", exact: true })).toBeVisible();
}

async function setBoundary(page: Page, changes: Partial<QueryBoundary>) {
  await page.evaluate((changes) => Object.assign((window as typeof window & { queryBoundary: QueryBoundary }).queryBoundary, changes), changes);
}

test("sorting works without a filter and clearing removes both server options", async ({ page }) => {
  await loadData(page);
  await expect(page.locator(".server-query-studio")).not.toHaveAttribute("open");
  await openQuery(page);
  await page.getByRole("combobox", { name: "Sırala", exact: true }).selectOption("id");
  await page.getByRole("combobox", { name: "Yön", exact: true }).selectOption("desc");
  await page.getByRole("button", { name: "Sorguyu uygula", exact: true }).click();
  await expect(page.locator(".attribute-table tbody tr").first().locator("td").nth(1)).toHaveText("130");
  await page.getByRole("combobox", { name: "Alan", exact: true }).selectOption("ilce");
  await page.getByRole("textbox", { name: "Değer", exact: true }).fill("Mamak");
  await page.getByRole("textbox", { name: "Değer", exact: true }).press("Enter");
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(65);
  await page.getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(page.locator(".query-active-badge")).toHaveCount(0);
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(100);
  await expect(page.locator(".attribute-table tbody tr").first().locator("td").nth(1)).toHaveText("1");
  const options = await page.evaluate(() => (window as typeof window & { queryBoundary: QueryBoundary }).queryBoundary.requests.at(-1));
  expect(options?.filter).toBeUndefined();
  expect(options?.orderBy).toBeUndefined();
  await page.getByRole("combobox", { name: "Alan", exact: true }).selectOption("ilce");
  await page.getByRole("textbox", { name: "Değer", exact: true }).fill("olmayan-ilçe");
  await page.getByRole("textbox", { name: "Değer", exact: true }).press("Enter");
  await expect(page.locator(".data-pagination")).toContainText("0–0 / 0");
  await page.getByRole("button", { name: "Sorguyu temizle", exact: true }).click();
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(100);
});

test("page size starts at the first page and next pages have no gaps or duplicates", async ({ page }) => {
  await loadData(page);
  await page.getByRole("combobox", { name: "Sayfa boyutu", exact: true }).selectOption("50");
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(50);
  await expect(page.locator(".data-pagination")).toContainText("1–50 / 130");
  await page.getByRole("button", { name: "Sonraki ›", exact: true }).click();
  await expect(page.locator(".data-pagination")).toContainText("51–100 / 130");
  await expect(page.locator(".attribute-table tbody tr").first().locator("td").nth(1)).toHaveText("51");
  await page.getByRole("button", { name: "Sonraki ›", exact: true }).click();
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(30);
  await expect(page.locator(".data-pagination")).toContainText("101–130 / 130");
  await expect(page.getByRole("button", { name: "Sonraki ›", exact: true })).toBeDisabled();
});

test("failed queries retain the last results and retry the exact failed operation", async ({ page }) => {
  await loadData(page);
  await openQuery(page);
  await page.getByRole("combobox", { name: "Alan", exact: true }).selectOption("ilce");
  await page.getByRole("textbox", { name: "Değer", exact: true }).fill("Mamak");
  await setBoundary(page, { failNext: true });
  await page.getByRole("button", { name: "Sorguyu uygula", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Son başarılı sonuçlar gösteriliyor");
  await expect(page.locator(".query-active-badge")).toHaveCount(0);
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(100);
  await page.getByRole("button", { name: "Yeniden dene", exact: true }).click();
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(65);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".query-active-badge")).toContainText("Uygulandı");
  await page.getByRole("combobox", { name: "Sayfa boyutu", exact: true }).selectOption("50");
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(50);
  await setBoundary(page, { failNext: true });
  await page.getByRole("button", { name: "Sonraki ›", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".data-pagination")).toContainText("1–50 / 65");
  await page.getByRole("button", { name: "Yeniden dene", exact: true }).click();
  await expect(page.locator(".data-pagination")).toContainText("51–65 / 65");
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(15);
});

test("loading announces progress and changing the layer ignores an older response", async ({ page }) => {
  await setBoundary(page, { holdNext: true });
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kayıtlar yükleniyor" })).toBeVisible();
  await expect(page.locator(".data-empty")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Sayfa boyutu", exact: true })).toBeEnabled();
  const layer = page.getByRole("combobox", { name: "Katman", exact: true });
  const selected = await layer.inputValue();
  const other = await layer.locator("option").evaluateAll((options, selected) => options.map((option) => option.getAttribute("value")).find((value) => value && value !== selected), selected);
  await layer.selectOption(other!);
  await page.evaluate(() => (window as typeof window & { queryBoundary: QueryBoundary }).queryBoundary.release?.());
  await expect(page.locator(".attribute-table")).toHaveCount(0);
  await loadData(page);
  await expect(page.locator(".data-query-status")).toContainText("130 kayıt bulundu");
});

test("empty search recovers and CSV includes only visible rows and selected columns", async ({ page }) => {
  await loadData(page);
  await page.getByRole("textbox", { name: "Bu sayfada hızlı ara", exact: true }).fill("bulunmayan-kayıt");
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Sayfa aramasını temizle", exact: true }).click();
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(100);
  await page.locator(".field-picker > summary").click();
  await page.getByRole("checkbox", { name: "İlçe", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Uzun açıklama ve inceleme bilgisi", exact: true }).uncheck();
  await expect(page.getByRole("checkbox", { name: "Kimlik", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Bu sayfada hızlı ara", exact: true }).fill("130");
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Bu sayfada hızlı ara", exact: true }).fill("100");
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Görünen 1 kaydı CSV olarak indir", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv.replace(/^\uFEFF/, "").trim()).toBe("Kimlik\n100");
});

test("expanded filters and long field labels reflow at 200 percent text size", async ({ page }) => {
  await loadData(page);
  await openQuery(page);
  await page.locator(".field-picker > summary").click();
  const inputs = [page.locator(".server-value-field input"), page.locator(".data-search input")];
  const originalSizes = await Promise.all(inputs.map((input) => input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))));
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const [index, input] of inputs.entries()) {
    const info = await input.evaluate((element) => ({ name: element.outerHTML.slice(0, 80), font: getComputedStyle(element).fontSize, dataFont: getComputedStyle(element).getPropertyValue("--data-font"), rootFont: getComputedStyle(document.documentElement).fontSize }));
    await expect.poll(() => input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)), { message: JSON.stringify(info) }).toBeGreaterThanOrEqual(originalSizes[index]! * 1.95);
  }
  await expect.poll(() => page.locator(".data-query-status").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(24);
  expect(await page.locator(".data-workbench").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const labels = page.locator(".field-picker-grid label span");
  for (const label of await labels.all()) expect(await label.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("combobox", { name: "Sırala", exact: true }).selectOption("id");
  const apply = page.getByRole("button", { name: "Sorguyu uygula", exact: true });
  await apply.scrollIntoViewIfNeeded();
  await expect(apply).toBeInViewport();
  const accessibility = await new AxeBuilder({ page }).include(".operations-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("data-large-text.png"), animations: "disabled", scale: "css" });
});
