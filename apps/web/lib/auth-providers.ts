/**
 * Which sign-in methods this deployment can actually offer (PRD-ACCT-001, D-009).
 *
 * D-009 is magic link first, Google second. Google needs an OAuth client in Google Cloud
 * and its keys in Supabase (LAUNCH_KEYS row 10), and until both exist the button would
 * send a traveler to an error page from Google — an option that can only fail. So the
 * sign-in screen asks the auth server what it has enabled, and offers only that.
 *
 * Read from GoTrue's own `/auth/v1/settings` rather than an env flag, because the flag
 * and the provider can disagree — somebody sets the variable and forgets the dashboard —
 * and the settings endpoint is the only thing that knows whether a sign-in will work.
 *
 * NEVER throws. An auth server that cannot be reached is a reason to show fewer options,
 * not to take the sign-in screen down: the magic link path still works on its own.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (!url || !key) return false;

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      // Revalidated every five minutes: turning Google on should not need a deploy, and
      // asking on every page view would put the auth server on the sign-in hot path.
      next: { revalidate: 300 },
    });
    if (!response.ok) return false;

    const settings = (await response.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
