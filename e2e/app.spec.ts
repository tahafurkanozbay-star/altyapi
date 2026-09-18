import { expect, test } from "@playwright/test";

test("production shell renders with comfort-white UI instead of a blank screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".brand")).toContainText("Altyapı / Üstyapı Koordinasyon");
  await expect(page.locator(".fatal-screen")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appReady)).toBe("true");

  const colorScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(colorScheme).toContain("light");
});

test("command palette and workspace surface are interactive", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const palette = page.getByRole("dialog", { name: "Komut paleti" });
  await expect(palette).toBeVisible();
  await expect(palette.getByText("Çalışma alanını yönet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  await page.getByRole("button", { name: "Çalışma alanı" }).click();
  await expect(page.getByRole("heading", { name: "Çalışma Alanı" })).toBeVisible();
  await expect(page.getByText("Çalışma Alanı Yöneticisi")).toBeVisible();
});

test("mobile layout keeps primary controls reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only assertion");
  await page.goto("/");
  await expect(page.locator(".tool-rail")).toBeVisible();
  await page.getByRole("button", { name: "Veri atölyesi" }).click();
  await expect(page.getByRole("heading", { name: "Veri Atölyesi" })).toBeVisible();
});
