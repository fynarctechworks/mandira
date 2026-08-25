import { test as setup } from "@playwright/test";
import { signInAsAdmin } from "./sign-in-helper";

export const OPS_STORAGE_STATE = "tests/e2e/.auth/ops-admin.json";

/**
 * Signs in once per run and saves the session for every Ops test to reuse.
 *
 * Not just a speed optimisation: GoTrue rate-limits magic-link sends per address, so
 * tests that each request their own link start failing the moment the suite grows —
 * which is exactly what happened when this file did not exist.
 *
 * The auth-gate spec deliberately opts OUT of this state, because signing in is the
 * behaviour it exists to verify.
 */
setup("authenticate as the Ops admin", async ({ page }) => {
  await signInAsAdmin(page);
  await page.context().storageState({ path: OPS_STORAGE_STATE });
});
