import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runtimeFixture } from "./runtimeFixture";
import { decodeShareState } from "../src/lib/urlState";

type ShareWindow = Window & { copyMode: string; nativeMode: string; copied: string[]; shared: string[]; releaseCopy?: () => void; copyFinished: number; activated: Array<{ id: string; opacity: number }> };
const transport = runtimeFixture.replace("async setLayerVisible(service, visible) {", "async setLayerVisible(service, visible) { (window.activated ||= []).push({id:service.id,opacity:service.opacity});");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Harita görünümünü paylaş", exact: true });
const open = (page: Page) => page.getByRole("button", { name: "Mevcut harita görünümünü paylaş", exact: true }).click();

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const w = window as unknown as ShareWindow;
    w.copyMode = "success"; w.nativeMode = "success"; w.copied = []; w.shared = []; w.copyFinished = 0;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (url: string) => {
      w.copied.push(url);
      if (w.copyMode === "fail") throw new DOMException("Denied", "NotAllowedError");
      if (w.copyMode === "hold") await new Promise<void>(resolve => { w.releaseCopy = resolve; });
      w.copyFinished += 1;
    } } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      if (w.nativeMode === "cancel") throw new DOMException("Cancelled", "AbortError");
      if (w.nativeMode === "fail") throw new DOMException("Denied", "NotAllowedError");
      w.shared.push(data.url!);
    } });
  });
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: "text/javascript", body: transport }));
  await page.route("https://**/*", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
});

test("sharing captures opacity and the recipient restores it over local preferences", async ({ page }) => {
  await page.locator('[data-panel-target="data"]').click();
  const layer = page.getByRole("combobox", { name: "Katman", exact: true });
  await expect(layer).not.toHaveValue("");
  const id = await layer.inputValue();
  await page.evaluate(id => {
    const value = JSON.parse(localStorage.getItem("altyapi:preferences:v5") ?? "{}");
    value.layerVisibility = { [id]: true }; value.layerOpacity = { [id]: 0.35 }; value.basemap = "topo-vector";
    localStorage.setItem("altyapi:preferences:v5", JSON.stringify(value));
  }, id);
  await page.reload(); await expect(page.locator(".boot-screen")).toHaveCount(0);
  const original = page.url(); await open(page);
  const link = dialog(page).getByRole("textbox", { name: "Paylaşım bağlantısı", exact: true });
  await expect(link).toBeFocused();
  const url = await link.inputValue();
  expect(decodeShareState(new URL(url).searchParams)).toMatchObject({ layerIds: [id], layerOpacity: { [id]: 0.35 }, basemap: "topo-vector" });
  await dialog(page).getByRole("button", { name: "Bağlantıyı kopyala", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toHaveText("Bağlantı panoya kopyalandı.");
  expect(page.url()).toBe(original);
  await page.keyboard.press("Escape"); await expect(dialog(page)).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Mevcut harita görünümünü paylaş", exact: true })).toBeFocused();
  await page.evaluate(id => {
    const value = JSON.parse(localStorage.getItem("altyapi:preferences:v5")!); value.layerOpacity[id] = 0.95;
    localStorage.setItem("altyapi:preferences:v5", JSON.stringify(value));
  }, id);
  await page.goto(url); await expect(page.locator(".boot-screen")).toHaveCount(0);
  await expect.poll(() => page.evaluate(id => (window as unknown as ShareWindow).activated?.find(item => item.id === id)?.opacity, id)).toBe(0.35);
});

test("clipboard denial leaves a selected manual link and native cancellation can recover", async ({ page }, info) => {
  await page.evaluate(() => { (window as unknown as ShareWindow).copyMode = "fail"; });
  const original = page.url(); await open(page);
  const link = dialog(page).getByRole("textbox", { name: "Paylaşım bağlantısı", exact: true });
  await dialog(page).getByRole("button", { name: "Bağlantıyı kopyala", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toContainText("Otomatik kopyalama kullanılamıyor");
  await expect(link).toBeFocused();
  expect(await link.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, (await link.inputValue()).length]);
  expect(page.url()).toBe(original);
  await page.evaluate(() => { (window as unknown as ShareWindow).nativeMode = "cancel"; });
  await dialog(page).getByRole("button", { name: "Cihazla paylaş", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toContainText("Paylaşım iptal edildi");
  expect(await page.evaluate(() => (window as unknown as ShareWindow).copied.length)).toBe(1);
  await page.evaluate(() => { (window as unknown as ShareWindow).nativeMode = "fail"; });
  await dialog(page).getByRole("button", { name: "Cihazla paylaş", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toContainText("Cihaz paylaşımı açılamadı");
  await page.evaluate(() => { (window as unknown as ShareWindow).nativeMode = "success"; });
  await dialog(page).getByRole("button", { name: "Cihazla paylaş", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toHaveText("Harita görünümü paylaşıldı.");
  expect(await page.evaluate(() => (window as unknown as ShareWindow).shared)).toEqual([await link.inputValue()]);
  const a11y = await new AxeBuilder({ page }).include(".share-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(a11y.violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: info.outputPath("share-recovery.png"), animations: "disabled", scale: "css" });
});

test("duplicate copy requests are blocked and a closed dialog ignores late completion", async ({ page }) => {
  await page.evaluate(() => { (window as unknown as ShareWindow).copyMode = "hold"; });
  await open(page);
  const copy = dialog(page).getByRole("button", { name: "Bağlantıyı kopyala", exact: true });
  await copy.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(copy).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as ShareWindow).copied.length)).toBe(1);
  await page.keyboard.press("Escape"); await open(page);
  await expect(dialog(page).getByRole("status")).toBeEmpty();
  await page.evaluate(() => (window as unknown as ShareWindow).releaseCopy?.());
  await expect.poll(() => page.evaluate(() => (window as unknown as ShareWindow).copyFinished)).toBe(1);
  await expect(dialog(page).getByRole("status")).toBeEmpty(); await expect(copy).toBeEnabled();
});

test("share controls remain usable on narrow screens, landscape and enlarged text", async ({ page }, info) => {
  await open(page);
  for (const size of [{ width: 320, height: 640 }, { width: 760, height: 360 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    await dialog(page).getByRole("button", { name: "Bağlantıyı kopyala", exact: true }).click();
    await expect(dialog(page).getByRole("status")).toHaveText("Bağlantı panoya kopyalandı.");
    await page.screenshot({ path: info.outputPath(`share-${size.width}.png`), animations: "disabled", scale: "css" });
  }
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(await dialog(page).evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const close = dialog(page).getByRole("button", { name: "Paylaşım penceresini kapat", exact: true });
  await close.scrollIntoViewIfNeeded(); await expect(close).toBeInViewport();
  await close.click(); await expect(dialog(page)).not.toBeVisible();
});
