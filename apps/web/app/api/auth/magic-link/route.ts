import { ApiError } from "@mandhira/db/api";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { rateLimit } from "@mandhira/db/rate-limit";
import { z } from "zod";

import { withApi } from "../../../../lib/api";
import { appOrigin, hashEmail, safeNext } from "../../../../lib/magic-link";

/**
 * `POST /api/auth/magic-link` — send a traveler a sign-in link (AUTH-01, TRD §6.2, TRD-SEC-001).
 *
 * Through the server rather than straight from the browser to Supabase Auth, so TRD §6.2's
 * `auth_magic_link` limit (5 an hour) holds twice over: per device through `withApi`, and per
 * address here — keyed on a hash, because a rate-limit row is no place for an email address.
 * The PKCE verifier cookie is set on the caller's browser, so the link signs in only there.
 */
const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  next: z.string().max(500).optional(),
  /*
   * PRD-PRIV-004: Mandhira has no under-18 accounts. A literal `true` rather than a
   * boolean, so an omitted or false value is refused by the schema instead of quietly
   * creating the account it forbids. The confirmation is stamped on the profile at
   * `/auth/callback` (0054), which is the first moment a user row exists to stamp.
   */
  adult: z.literal(true),
});

export const POST = withApi({
  schema,
  rateLimit: "auth_magic_link",
  handler: async ({ input, request, supabase }) => {
    /*
     * PRD-PRIV-005. Consent to nothing is not consent.
     *
     * Until an admin has published the notice and the grievance contact (0054), there is
     * no lawful basis to open an account, so we do not open one. The privacy screen tells
     * a traveler the same thing in the same words, and the Ops screen says which notice is
     * missing — nobody has to guess why sign-in is closed.
     */
    const { data: ready } = await supabase.rpc("legal_notices_ready");
    if (ready !== true) {
      throw new ApiError(
        // 403: nothing failed — the operation is simply not permitted in this state.
        "forbidden",
        "Signing in is not open yet, because we have not published what you would be agreeing to.",
      );
    }

    const perAddress = await rateLimit(
      createServiceRoleSupabase(),
      "auth_magic_link",
      `email:${hashEmail(input.email)}`,
    );
    if (!perAddress.allowed) {
      throw new ApiError(
        "rate_limited",
        "That's a few links in a short time. Please wait a little.",
      );
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: input.email,
      options: {
        emailRedirectTo: `${appOrigin(request)}/auth/callback?next=${encodeURIComponent(safeNext(input.next))}`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      if (error.status === 429) {
        throw new ApiError(
          "rate_limited",
          "That's a few links in a short time. Please wait a little.",
        );
      }
      throw new ApiError(
        "failed",
        "We couldn't send that link just now. Please try again in a moment.",
      );
    }

    return { sent: true };
  },
});
