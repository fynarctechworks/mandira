import { test as setup, type Page } from "@playwright/test";
import { latestMagicLink } from "../ops/sign-in-helper";

export const WEB_STORAGE_STATE = "tests/e2e/.auth/traveler.json";

/**
 * A SECOND traveler, and the reason there is one.
 *
 * `journeys_write` is 120 per hour PER USER (TRD §6.2). A suite that signs in once and
 * then builds every journey as that one person spends a real traveler's whole hourly
 * budget in ninety seconds, and the run went red with 429s the day the Record spec was
 * added — not because anything was wrong with the product.
 *
 * The limit is correct and is not touched; CLAUDE.md §5 forbids weakening one even in a
 * test, and `0010_ai_rate_limits_test.sql` still asserts it. What was wrong was the
 * fixture: one account standing in for a whole suite is the artefact. Two travelers is
 * what two travelers would be in production.
 */
export const WEB_STORAGE_STATE_B = "tests/e2e/.auth/traveler-b.json";

/**
 * The address this run's traveler signs in as.
 *
 * Fresh per run so a rerun never inherits a previous run's saved journeys — the list
 * screen asserts on what this run created, and a growing pile of leftovers would make it
 * pass for the wrong reason.
 */
export const TRAVELER_EMAIL = `traveler-${Date.now()}@mandhira.local`;
export const TRAVELER_EMAIL_B = `traveler-b-${Date.now()}@mandhira.local`;

/**
 * Signs in once, and every traveler test that needs an account reuses the session.
 *
 * Not a speed optimisation. GoTrue rate-limits magic-link sends per address, so a suite
 * where each test requests its own link starts failing the moment it grows past a handful
 * — which is exactly what happened here before this file existed, and is the same reason
 * `ops/auth.setup.ts` exists.
 *
 * Drives the REAL flow: request a link, read it out of the local mail catcher, follow it.
 * A fabricated cookie would prove the fixture works, not that a traveler can sign in.
 */
setup("authenticate as a traveler", async ({ page }) => {
  await signIn(page, TRAVELER_EMAIL, WEB_STORAGE_STATE);
});

setup("authenticate as a second traveler", async ({ page }) => {
  await signIn(page, TRAVELER_EMAIL_B, WEB_STORAGE_STATE_B);
});

async function signIn(page: Page, email: string, storageState: string) {
  await page.goto("/en/sign-in");
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: /Email me a link/i }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();

  await page.goto(await latestMagicLink(email));
  await page.waitForURL(/\/en\//);

  await page.context().storageState({ path: storageState });
}
