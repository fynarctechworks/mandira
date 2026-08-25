import type { Page } from "@playwright/test";

/**
 * Signs in as the seeded local Ops admin by driving the REAL magic-link flow: request a
 * link, read it out of the local mail catcher, follow it.
 *
 * Deliberately not a fabricated session cookie. During B-007 a hand-built cookie was
 * silently rejected by `@supabase/ssr` while the app was perfectly healthy — a helper
 * like that proves the helper works, not that sign-in does.
 *
 * Requires the local stack (`supabase start` + `supabase db reset`).
 */
const MAILPIT = process.env["MANDHIRA_MAILPIT_URL"] ?? "http://127.0.0.1:54424";

export async function latestMagicLink(email: string): Promise<string> {
  const listRes = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(email)}`);
  if (!listRes.ok) throw new Error(`Mailpit search failed: ${listRes.status}`);

  const list = (await listRes.json()) as { messages?: { ID: string }[] };
  const id = list.messages?.[0]?.ID;
  if (!id) throw new Error(`No message for ${email}. Is the local stack running?`);

  const body = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Text?: string;
    HTML?: string;
  };

  const match = `${body.Text ?? ""}\n${body.HTML ?? ""}`.match(
    /https?:\/\/[^\s"'<>]*(?:verify|callback)[^\s"'<>]*/i,
  );
  if (!match) throw new Error("No sign-in link found in the message body.");
  return match[0].replace(/&amp;/g, "&");
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("admin@mandhira.local");
  await page.getByRole("button", { name: /Email me a sign-in link/i }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();

  await page.goto(await latestMagicLink("admin@mandhira.local"));
  await page.getByRole("heading", { name: "Operations", exact: true }).waitFor();
}
