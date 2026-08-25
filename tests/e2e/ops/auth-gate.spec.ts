import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * End-to-end authorization gate (AUTH-01, AUTH-05).
 *
 * Drives the REAL magic-link flow: request a link, collect it from the local mail catcher,
 * follow it, land with a session. Nothing here fabricates a cookie, because a fabricated
 * cookie proves the test can build a cookie, not that sign-in works — during B-007 a
 * hand-built one was silently rejected while the app was perfectly healthy.
 *
 * Requires the local stack (`supabase start` + `supabase db reset`), which seeds
 * admin@mandhira.local with the `admin` role.
 */

const MAILPIT = process.env["MANDHIRA_MAILPIT_URL"] ?? "http://127.0.0.1:54424";

/** Pulls the most recent sign-in link sent to an address out of the local mail catcher. */
async function latestMagicLink(email: string): Promise<string> {
  const listRes = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(email)}`);
  if (!listRes.ok) throw new Error(`Mailpit search failed: ${listRes.status}`);

  const list = (await listRes.json()) as { messages?: { ID: string }[] };
  const id = list.messages?.[0]?.ID;
  if (!id) throw new Error(`No message for ${email}. Is the local stack running?`);

  const bodyRes = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const body = (await bodyRes.json()) as { Text?: string; HTML?: string };
  const source = `${body.Text ?? ""}\n${body.HTML ?? ""}`;

  const match = source.match(/https?:\/\/[^\s"'<>]*(?:verify|callback)[^\s"'<>]*/i);
  if (!match) throw new Error(`No sign-in link found in the message body.`);
  return match[0].replace(/&amp;/g, "&");
}

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
    await page.getByLabel("Work email").fill("admin@mandhira.local");
    await page.getByRole("button", { name: /Email me a sign-in link/i }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    await page.goto(await latestMagicLink("admin@mandhira.local"));

    await expect(page.getByRole("heading", { name: "Operations shell" })).toBeVisible();

    // The authenticated shell is only reachable here, so its axe check belongs here too.
    const results = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(results)).toEqual([]);
  });
});
