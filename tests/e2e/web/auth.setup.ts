import { test as setup } from "@playwright/test";
import { latestMagicLink } from "../ops/sign-in-helper";

export const WEB_STORAGE_STATE = "tests/e2e/.auth/traveler.json";

/**
 * The address this run's traveler signs in as.
 *
 * Fresh per run so a rerun never inherits a previous run's saved journeys — the list
 * screen asserts on what this run created, and a growing pile of leftovers would make it
 * pass for the wrong reason.
 */
export const TRAVELER_EMAIL = `traveler-${Date.now()}@mandhira.local`;

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
  await page.goto("/en/sign-in");
  await page.getByLabel("Your email").fill(TRAVELER_EMAIL);
  await page.getByRole("button", { name: /Email me a link/i }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();

  await page.goto(await latestMagicLink(TRAVELER_EMAIL));
  await page.waitForURL(/\/en\//);

  await page.context().storageState({ path: WEB_STORAGE_STATE });
});
