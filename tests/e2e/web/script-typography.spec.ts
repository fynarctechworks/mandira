import { expect, test } from "@playwright/test";

/**
 * Telugu and Hindi get the line height their scripts need (design review: "tight Telugu
 * line height"). Telugu stacks vowel signs above and below the letter; at the Latin scale's
 * line heights those marks crowd the line above or are cut off.
 *
 * Measured from the browser's computed style, because the rule lives in CSS and a unit
 * test cannot see whether it actually won the cascade against the size utility.
 */
test.describe("Line height follows the script", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const lineHeightOf = async (page: import("@playwright/test").Page, selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((node) => getComputedStyle(node).lineHeight);

  test("Telugu body text has room for its vowel signs", async ({ page }) => {
    await page.goto("/te");
    expect(await lineHeightOf(page, ".text-body")).toBe("28px");
    expect(await lineHeightOf(page, ".text-display")).toBe("46px");
  });

  test("Hindi gets a little more than Latin, less than Telugu", async ({ page }) => {
    await page.goto("/hi");
    expect(await lineHeightOf(page, ".text-body")).toBe("26px");
  });

  test("English keeps the scale it was designed with", async ({ page }) => {
    await page.goto("/en");
    expect(await lineHeightOf(page, ".text-body")).toBe("24px");
    expect(await lineHeightOf(page, ".text-display")).toBe("40px");
  });
});
