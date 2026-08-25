import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";
import { latestMagicLink } from "./sign-in-helper";

/**
 * End-to-end authorization gate (AUTH-01, AUTH-05).
 *
 * Drives the REAL magic-link flow: request a link, collect it from the local mail catcher,
 * follow it, land with a session. Nothing here fabricates a cookie, because a fabricated
 * cookie proves the test can build a cookie, not that sign-in works — during B-007 a
 * hand-built one was silently rejected while the app was perfectly healthy.
 *
 * Requires the local stack (`supabase start` + `supabase db reset`), which seeds
 * ops-e2e@mandhira.local with the `admin` role.
 */

test.describe("Ops authorization gate", () => {
  test("an anonymous visitor is sent to sign-in, not the Ops shell", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("the sign-in page offers magic link and Google, and no password field", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: /Email me a sign-in link/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    // D-009: passwords are not an auth method. A password box would imply otherwise.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("an operator with a role reaches the Ops shell via a real magic link", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill("ops-e2e@mandhira.local");
    await page.getByRole("button", { name: /Email me a sign-in link/i }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    await page.goto(await latestMagicLink("ops-e2e@mandhira.local"));

    await expect(page.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();

    // The authenticated shell is only reachable here, so its axe check belongs here too.
    const results = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(results)).toEqual([]);
  });
});
