import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Notifications (B-027, PRD F15, NOTF-01..04).
 *
 * PRD F15's restraint rules are the interesting part, and they are the ones a test can
 * actually hold: seven types, all switchable, suggestions off by default, no marketing.
 * An app that buzzes is an app people silence — and the leave-by reminder that mattered
 * goes with it.
 */
test.describe("The notifications screen", () => {
  test("offers every one of PRD F15's seven types", async ({ page }) => {
    await page.goto("/en/notifications");

    for (const label of [
      "Booking deadlines",
      "Your journey starts tomorrow",
      "Time to set off",
      "Something changed",
      "We checked something you told us",
      "Advisories",
      "Suggestions",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("has suggestions off and journey reminders on, by default", async ({ page }) => {
    await page.goto("/en/notifications");

    // PRD F15's own defaults. Suggestions are the only marketing-adjacent type, and the
    // only one that starts off.
    await expect(page.getByRole("checkbox", { name: "Suggestions" })).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    await expect(page.getByRole("checkbox", { name: "Time to set off" })).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  test("says when each one fires, not just what it is called", async ({ page }) => {
    await page.goto("/en/notifications");

    // "Leave-by reminder" tells someone nothing; the timing is what tells them whether
    // they want it.
    await page
      .getByRole("button", { name: /When\?/ })
      .nth(2)
      .click();
    await expect(page.getByText(/15 minutes before you need to leave/)).toBeVisible();
  });

  test("states the restraint promise on the screen itself", async ({ page }) => {
    await page.goto("/en/notifications");

    // PRD-NOTF-003, said to the traveler rather than only honoured in code.
    await expect(page.getByText(/never sends marketing/)).toBeVisible();
    await expect(page.getByText(/one non-journey message a week/)).toBeVisible();
  });

  test("a switch persists across a reload", async ({ page }) => {
    await page.goto("/en/notifications");

    const suggestions = page.getByRole("checkbox", { name: "Suggestions" });
    await suggestions.click();
    await expect(suggestions).toHaveAttribute("data-state", "checked");

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Suggestions" })).toHaveAttribute(
      "data-state",
      "checked",
    );

    // Put it back, so the default state is what the next test sees.
    await page.getByRole("checkbox", { name: "Suggestions" }).click();
  });

  test("is accessible", async ({ page }) => {
    await page.goto("/en/notifications");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results)).toEqual([]);
  });
});

test.describe("Who may subscribe", () => {
  test("a guest cannot register a push subscription", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();

    const response = await stranger.request.post("/api/notifications/subscribe", {
      data: {
        endpoint: "https://push.example.invalid/anonymous",
        keys: { p256dh: "k", auth: "a" },
      },
    });

    expect(response.status()).toBe(401);
    await context.close();
  });

  test("the sender refuses an unauthenticated call", async ({ page }) => {
    // It runs as service-role across every traveler, so an open endpoint here would be
    // worth considerably more to an attacker than to us.
    const response = await page.request.get("/api/cron/notifications");
    expect([401, 404]).toContain(response.status());
  });
});
