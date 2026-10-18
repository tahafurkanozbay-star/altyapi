import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { runtimeFixture } from "./runtimeFixture";

type CaptureWindow = Window & { captureMode: string; captureCalls: number; releaseCapture?: () => void; captureFinished: number };
const transport = runtimeFixture.replace("async takeScreenshot() { return null; }", `async takeScreenshot() {
  window.captureCalls = (window.captureCalls || 0) + 1;
  const mode = window.captureMode || 'success'; window.captureMode = 'success';
  if (mode === 'hold') await new Promise(resolve => { window.releaseCapture = resolve; });
  if (mode === 'fail') throw new Error('capture failed');
  const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 6;
  window.captureFinished = (window.captureFinished || 0) + 1;
  return canvas.toDataURL('image/png');
}`);

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/src\/gis\/ArcGISRuntime\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: "text/javascript", body: transport }));
  await page.route("https://**/*", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".boot-screen")).toHaveCount(0);
  const close = page.locator(".panel-zone [data-panel-close]");
  if (await close.isVisible()) await close.click();
});

test("PNG capture reports progress, prevents duplicates and downloads a valid image", async ({ page }) => {
  const capture = page.locator('[data-tool-action="screenshot"]');
  await page.evaluate(() => { (window as unknown as CaptureWindow).captureMode = "hold"; });
  await capture.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(capture).toBeDisabled(); await expect(capture).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => (window as unknown as CaptureWindow).captureCalls)).toBe(1);
  const downloadPromise = page.waitForEvent("download");
  await page.evaluate(() => (window as unknown as CaptureWindow).releaseCapture?.());
  const download = await downloadPromise;
  const buffer = await readFile((await download.path())!);
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(download.suggestedFilename()).toMatch(/^3d-altyapi-ustyapi-koordinasyon-.*\.png$/);
  await expect(capture).toBeEnabled(); await expect(capture).not.toHaveAttribute("aria-busy", "true");
});

test("capture failure and timeout recover without downloading a late image", async ({ page }) => {
  const capture = page.locator('[data-tool-action="screenshot"]');
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const downloads: string[] = []; page.on("download", download => downloads.push(download.suggestedFilename()));
  await page.evaluate(() => { (window as unknown as CaptureWindow).captureMode = "fail"; });
  await capture.click();
  await expect(page.locator(".toast-error")).toContainText("Ekran görüntüsü oluşturulamadı");
  await expect(capture).toBeEnabled();
  await page.evaluate(() => { (window as unknown as CaptureWindow).captureMode = "hold"; });
  await capture.click(); await expect(capture).toBeDisabled();
  await page.clock.fastForward(20_001);
  await expect(page.locator(".toast-error")).toContainText("Ekran görüntüsü zamanında tamamlanamadı");
  await expect(capture).toBeEnabled();
  await page.evaluate(() => (window as unknown as CaptureWindow).releaseCapture?.());
  await expect.poll(() => page.evaluate(() => (window as unknown as CaptureWindow).captureFinished)).toBe(1);
  expect(downloads).toEqual([]); expect(errors).toEqual([]);
  const success = page.waitForEvent("download"); await capture.click(); await success;
  expect(downloads).toHaveLength(1);
});
