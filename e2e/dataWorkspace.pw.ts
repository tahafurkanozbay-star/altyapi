import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { queryFixture, requests } from "./attributeFixture";

const longValue = "Bu kaydın açıklaması tamamen okunmalıdır. " + "UzunDeğer".repeat(50);
const richFixture = queryFixture.replace("...base, rows, total,", `...base, fields: [...base.fields, {name:'ek1',alias:'Ek alan 1'}, {name:'ek2',alias:'Ek alan 2'}, {name:'kayitNotu',alias:'Kayıt notu'}], rows: rows.map((row,i) => ({...row, aciklama: i===0 ? ${JSON.stringify(longValue)} : '=1+1', ek1:'Bir', ek2:'İki', kayitNotu:i===0 ? 'Kızılay özel notu' : 'Diğer not'})), total,`);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: "text/javascript", body: richFixture }));
  await page.route("https://**/*", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  await page.locator('[data-panel-target="data"]').click();
  await page.getByRole("button", { name: "Veriyi getir", exact: true }).click();
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(100);
});

test("compact query controls preserve drafts and sorting works without a filter", async ({ page }) => {
  const toggle = page.locator(".server-query-studio > summary");
  await expect(page.locator(".server-query-studio")).not.toHaveAttribute("open");
  await expect(page.getByRole("textbox", { name: "Değer", exact: true })).toBeHidden();
  await toggle.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".server-query-studio")).toHaveAttribute("open", "");
  await expect(page.getByRole("combobox", { name: "Alan", exact: true })).toHaveValue("");
  await page.getByRole("combobox", { name: "Sırala", exact: true }).selectOption("mahalle");
  await page.getByRole("combobox", { name: "Yön", exact: true }).selectOption("desc");
  await page.getByRole("button", { name: "Sorguyu uygula", exact: true }).click();
  await expect.poll(async () => (await requests(page)).length).toBe(2);
  expect((await requests(page)).at(-1)!.options).toMatchObject({ offset: 0, orderBy: { field: "mahalle", direction: "desc" } });
  expect((await requests(page)).at(-1)!.options.filter).toBeUndefined();
  await expect(toggle).toContainText("mahalle azalan");
  await page.getByRole("combobox", { name: "Alan", exact: true }).selectOption("id");
  const value = page.getByRole("textbox", { name: "Değer", exact: true });
  await value.press("Enter"); expect((await requests(page)).length).toBe(2);
  await value.fill("   "); await value.press("Enter"); expect((await requests(page)).length).toBe(2);
  await value.fill("5"); await toggle.click(); await toggle.click();
  await expect(value).toHaveValue("5");
  await value.press("Enter");
  await expect.poll(async () => (await requests(page)).length).toBe(3);
  expect((await requests(page)).at(-1)!.options.filter).toEqual({ field: "id", operator: "equals", value: "5" });
  await page.getByRole("button", { name: "Temizle", exact: true }).click();
  await expect(page.locator(".query-active-badge")).toHaveCount(0);
  expect((await requests(page)).at(-1)!.options.filter).toBeUndefined();
  expect((await requests(page)).at(-1)!.options.orderBy).toBeUndefined();
  await page.getByRole("combobox", { name: "Alan", exact: true }).selectOption("id");
  await page.getByRole("combobox", { name: "Operatör", exact: true }).selectOption("isNull");
  await expect(value).toBeDisabled();
  await page.getByRole("button", { name: "Sorguyu uygula", exact: true }).click();
  await expect.poll(async () => (await requests(page)).length).toBe(5);
  expect((await requests(page)).at(-1)!.options.filter).toEqual({ field: "id", operator: "isNull" });
});

test("table jump and complete record details work with keyboard and hidden columns", async ({ page }, info) => {
  const table = page.getByRole("region", { name: "Öznitelik sonuç tablosu", exact: true });
  await page.getByRole("button", { name: "Tabloya git", exact: true }).click();
  await expect(table).toBeFocused(); await expect(table).toBeInViewport();
  await expect(table.locator("thead")).not.toContainText("Kayıt notu");
  const open = page.getByRole("button", { name: "1. kaydı incele", exact: true });
  await open.focus(); await page.keyboard.press("Enter");
  const detail = page.getByRole("region", { name: "Kayıt ayrıntıları", exact: true });
  await expect(detail).toBeFocused();
  await expect(detail.locator("dd").filter({ hasText: longValue })).toHaveText(longValue);
  await expect(detail).toContainText("Kızılay özel notu");
  await expect.poll(() => detail.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const values = page.getByRole("region", { name: "Kayıt alanları", exact: true });
  await values.focus(); await page.keyboard.press("End");
  await expect.poll(() => values.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const accessibility = await new AxeBuilder({ page }).include(".operations-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  await page.screenshot({ path: info.outputPath("complete-record.png"), animations: "disabled", scale: "css" });
  await page.getByRole("button", { name: "Kayıt ayrıntılarını kapat", exact: true }).click();
  await expect(detail).toHaveCount(0); await expect(open).toBeFocused();
  await page.getByRole("button", { name: "Sonraki ›", exact: true }).click();
  await expect(page.locator(".data-record-detail")).toHaveCount(0);
});

test("page search includes hidden fields and CSV contains exactly the visible rows and columns", async ({ page }) => {
  const search = page.getByRole("textbox", { name: "Bu sayfada hızlı ara", exact: true });
  await search.fill("KIZILAY");
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(1);
  expect((await requests(page)).length).toBe(1);
  await expect(page.locator(".data-scope-note").first()).toContainText("gösterilen 1 satır ve 8 sütun");
  await page.locator(".field-picker summary").click();
  const fields = page.locator(".field-picker").getByRole("checkbox");
  for (const name of ["ilce", "mahalle", "adres", "aciklama", "durum", "Ek alan 1", "Ek alan 2"]) await page.locator(".field-picker").getByRole("checkbox", { name, exact: true }).uncheck();
  await expect(fields.first()).toBeChecked(); await expect(fields.first()).toBeDisabled();
  await expect(page.locator(".attribute-table tbody tr")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /CSV olarak indir/ }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toBe("\uFEFFKimlik\n1");
  await page.locator(".field-picker").getByRole("checkbox", { name: "aciklama", exact: true }).check();
  await search.fill("=1+1"); await expect(page.locator(".attribute-table tbody tr")).toHaveCount(99);
  const formulasPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /CSV olarak indir/ }).click();
  const csv = await readFile((await (await formulasPromise).path())!, "utf8");
  expect(csv.split("\n")).toHaveLength(100); expect(csv).toContain("2,'=1+1"); expect(csv).not.toContain("Kayıt notu");
});

test("narrow and short screens keep results and record controls inside the panel", async ({ page }, info) => {
  for (const viewport of [{ width: 320, height: 640 }, { width: 760, height: 360 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    // Resize can replace modal semantics; bring the retained workbench into view.
    await page.getByRole("button", { name: "Tabloya git", exact: true }).click();
    const table = page.getByRole("region", { name: "Öznitelik sonuç tablosu", exact: true });
    await expect(table).toBeFocused(); await expect(table).toBeInViewport();
    await expect.poll(() => page.locator(".data-workbench").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const close = page.locator(".operations-heading [data-panel-close]");
    await expect(close).toBeInViewport();
    await expect.poll(() => close.evaluate(button => {
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.screenshot({ path: info.outputPath(`data-workspace-${viewport.width}.png`), animations: "disabled", scale: "css" });
  }
});
