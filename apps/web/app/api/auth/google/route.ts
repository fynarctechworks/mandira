import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../lib/api";
import { appOrigin, safeNext } from "../../../../lib/magic-link";

/**
 * `POST /api/auth/google` — start "Continue with Google" (PRD-ACCT-001, D-009).
 *
 * Through the server rather than `signInWithOAuth` in the browser, for the same reason the
 * magic link is: the two promises sign-in has to keep are enforced HERE, where a stale
 * client or a script cannot walk past them.
 *
 *   - PRD-PRIV-004: no account without the holder confirming they are 18 or older.
 *   - PRD-PRIV-005: no account at all until the consent notice exists to consent to.
 *
 * A Google sign-in that skipped either would be a side door around both, and it would be
 * the side door most people use.
 *
 * Answers with the provider URL rather than redirecting, because the PKCE verifier cookie
 * is set on THIS response — the browser must receive it before it leaves for Google, or
 * the code that comes back cannot be exchanged. `/auth/callback` finishes the job and
 * stamps the adult confirmation exactly as it does for a magic link.
 */
const schema = z.object({
  next: z.string().max(500).optional(),
  adult: z.literal(true),
});

export const POST = withApi({
  schema,
  rateLimit: "auth_magic_link",
  handler: async ({ input, request, supabase }) => {
    const { data: ready } = await supabase.rpc("legal_notices_ready");
    if (ready !== true) {
      throw new ApiError(
        "forbidden",
        "Signing in is not open yet, because we have not published what you would be agreeing to.",
      );
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appOrigin(request)}/auth/callback?next=${encodeURIComponent(safeNext(input.next))}`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      throw new ApiError(
        "failed",
        "Google sign-in isn't available just now. You can use the email link instead.",
      );
    }

    return { url: data.url };
  },
});
