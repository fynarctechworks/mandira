import { createTraveler, travelerSchema } from "../../../lib/account";
import { withApi } from "../../../lib/api";

/**
 * Adding someone the traveler journeys with (PRD F13, A23, PRD-PLAN-010).
 *
 * Only what the planner uses — mobility and age band — plus a label the traveler chooses.
 * `traveler_profiles` is the most sensitive table in the schema, and RLS keeps every row on
 * its owner's account.
 */

export const POST = withApi({
  schema: travelerSchema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, supabase, user }) => ({
    traveler: await createTraveler(supabase, user!.id, {
      label: input.label || null,
      mobility: input.mobility,
      ageBand: input.ageBand,
    }),
  }),
});
