import { z } from "zod";

import { withApi } from "../../../../lib/api";
import { readPreferences, writePreferences } from "../../../../lib/notifications";

/**
 * The seven switches (PRD-NOTF-001).
 *
 * All of them switchable, which is the point: PRD F15 lists seven types and every one is
 * the traveler's call. Suggestions default OFF and are the only type that is even
 * marketing-adjacent — the other six are the journey they asked for, arriving on time.
 *
 * A partial update, so a screen can toggle one switch without having to send the state of
 * the other six back. Sending all seven would mean a stale client silently reverting a
 * change made on another device.
 */
const schema = z.object({
  prepare_deadline: z.boolean().optional(),
  journey_tomorrow: z.boolean().optional(),
  leave_by: z.boolean().optional(),
  journey_change: z.boolean().optional(),
  report_resolved: z.boolean().optional(),
  advisory: z.boolean().optional(),
  suggestion: z.boolean().optional(),
  // Consent to email: beside the seven rather than one of them, and off by default (D-171).
  email: z.boolean().optional(),
});

export const PATCH = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, supabase, user }) => {
    /*
     * Undefined keys are stripped rather than written. Under `exactOptionalPropertyTypes`
     * an absent switch and a switch set to undefined are different things, and only the
     * first is what a partial update means.
     */
    const prefs = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );

    await writePreferences(supabase, user!.id, prefs);
    return { prefs: await readPreferences(supabase, user!.id) };
  },
});
