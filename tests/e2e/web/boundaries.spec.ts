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

test.describe("A guest's rate-limit identity (OPEN-011)", () => {
  test("every browser gets its own, so one guest cannot spend everyone's quota", async ({
    browser,
  }) => {
    const first = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const second = await browser.newContext({ storageState: { cookies: [], origins: [] } });

    await (await first.newPage()).goto("/en");
    await (await second.newPage()).goto("/en");

    const deviceOf = async (context: Awaited<ReturnType<typeof browser.newContext>>) =>
      (await context.cookies()).find((cookie) => cookie.name === "mandhira_device")?.value;

    const a = await deviceOf(first);
    const b = await deviceOf(second);

    /*
     * Until this existed, `withApi` fell back to the literal string "anonymous" for every
     * guest — one shared bucket, so the first traveler to spend their ten intent
     * extractions spent everyone's.
     */
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);

    await first.close();
    await second.close();
  });

  test("is not readable by page scripts", async ({ page }) => {
    await page.goto("/en");

    // httpOnly. It identifies a browser for rate limiting and nothing else; there is no
    // reason for a script to see it, and one less thing to leak if one is ever injected.
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain("mandhira_device");
  });
});
