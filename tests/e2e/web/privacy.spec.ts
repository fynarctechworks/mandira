import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * The two DPDP obligations that used to be prose only (PRD-PRIV-004, PRD-PRIV-005).
 *
 * Read as a guest throughout, because that is who they are for: somebody deciding whether
 * to sign in at all has to be able to read what they would be agreeing to, and to be
 * stopped if they are not old enough to agree.
 */
test.describe("Before an account exists", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the notice you are agreeing to is readable without signing in", async ({ page }) => {
    await page.goto("/en/sign-in");

    const link = page.getByRole("link", { name: /What we collect/i });
    await expect(link).toBeVisible();
    await link.click();

    await expect(
      page.getByRole("heading", { name: "Your information", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you are agreeing to" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Who to contact" })).toBeVisible();
  });

  test("sign-in asks whether you are an adult, and will not proceed until you say so", async ({
    page,
  }) => {
    await page.goto("/en/sign-in");

    const adult = page.getByLabel(/I am 18 or older/i);
    await expect(adult).not.toBeChecked();

    // PRD-PRIV-004: the button is the courtesy; the server is the control, asserted below.
    await expect(page.getByRole("button", { name: /Email me a link/i })).toBeDisabled();

    await adult.check();
    await expect(page.getByRole("button", { name: /Email me a link/i })).toBeEnabled();
  });

  test("the server refuses a link to somebody who never confirmed it", async ({ page }) => {
    const response = await page.request.post("/api/auth/magic-link", {
      data: { email: "not-confirmed@example.test" },
    });

    expect(response.status()).toBe(400);
  });

  test("the privacy screen is accessible", async ({ page }) => {
    await page.goto("/en/privacy");
    await page.getByRole("heading", { name: "Your information", exact: true }).waitFor();

    const results = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(results)).toEqual([]);
  });
});

/**
 * PRD-ACCT-001: Google is the second way in (D-009) — but only when the auth server has it
 * switched on. Locally there is no OAuth client, so the right behaviour is no button: one
 * that sent a traveler to an error page from Google would be worse than none.
 */
test.describe("Signing in with Google", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is not offered while the provider is switched off", async ({ page }) => {
    await page.goto("/en/sign-in");
    await expect(page.getByRole("button", { name: /Email me a link/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toHaveCount(0);
  });

  test("the server still refuses without the adult confirmation", async ({ page }) => {
    const response = await page.request.post("/api/auth/google", { data: {} });
    expect(response.status()).toBe(400);
  });
});
