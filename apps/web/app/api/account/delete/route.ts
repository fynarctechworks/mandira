import { z } from "zod";

import { cancelErasure, requestErasure } from "../../../../lib/account";
import { withApi } from "../../../../lib/api";

/**
 * Account erasure (PRD-PRIV-004, TRD §5.2).
 *
 * Asking starts a 30-day grace period; the daily purge job does the erasing (0013). Until then
 * the traveler can keep their account, which is the DELETE. `confirm: true` is required so a
 * stray request cannot start the clock.
 */
export const POST = withApi({
  schema: z.object({ confirm: z.literal(true) }),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ supabase }) => ({ scheduledFor: await requestErasure(supabase) }),
});

export const DELETE = withApi({
  schema: z.object({}),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ supabase }) => {
    await cancelErasure(supabase);
    return { scheduledFor: null };
  },
});
