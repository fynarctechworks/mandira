import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * The states every view needs when it cannot show what it was asked for (CLAUDE.md §4).
 *
 * Until these existed, Next's own fallbacks showed through: *"Application error: a
 * server-side exception has occurred"* with a digest number, and a bare 404. That is three
 * of PRD §12.7's forbidden words in one sentence, shown to someone who may be standing in
 * a queue on a bad signal.
 *
 * The assertions are therefore about VOCABULARY as much as about status codes. A 404 that
 * renders is only half the requirement; a 404 that renders and says "error" fails the
 * product.
 */

/** PRD §12.7's ban list, as the traveler-facing copy check. */
const FORBIDDEN = /\berror\b|\bfailed\b|\binvalid\b|URGENT|!/i;

test.describe("A page that is not there", () => {
  test("answers 404 with Mandhira's own words, not the framework's", async ({ page }) => {
    const response = await page.goto("/en/this-page-does-not-exist");
    expect(response?.status()).toBe(404);

    await expect(page.getByRole("heading", { name: /isn't here/ })).toBeVisible();

    // The wording has to cover a revoked share link too, without confirming that anything
    // was ever behind it.
    await expect(page.getByText(/no longer being shared/)).toBeVisible();
  });

  test("says nothing PRD §12.7 forbids", async ({ page }) => {
    await page.goto("/en/this-page-does-not-exist");

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(FORBIDDEN);
  });

  test("offers a way back rather than a dead end", async ({ page }) => {
    await page.goto("/en/this-page-does-not-exist");

    await page.getByRole("link", { name: /home screen/ }).click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test("is accessible", async ({ page }) => {
    await page.goto("/en/this-page-does-not-exist");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results)).toEqual([]);
  });
});

test.describe("A revoked share link", () => {
  test("lands on the 404 a traveler can read, not a framework page", async ({ page }) => {
    // The token shape is right; the token is not real. This is exactly what someone sees
    // after the person who shared it taps "Stop sharing".
    const response = await page.goto(`/en/s/${"x".repeat(43)}`);
    expect(response?.status()).toBe(404);

    await expect(page.getByRole("heading", { name: /isn't here/ })).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(FORBIDDEN);
  });
});
