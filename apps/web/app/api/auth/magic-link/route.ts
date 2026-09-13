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
});

export const POST = withApi({
  schema,
  rateLimit: "auth_magic_link",
  handler: async ({ input, request, supabase }) => {
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
