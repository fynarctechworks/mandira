import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { setTaskDone } from "../../../../../lib/prepare";

/**
 * Ticking a Prepare task (PRD-PREP-001).
 *
 * PRD Principle 6 applies to the smallest actions too: a checkbox moves because the
 * traveler moved it, and nothing here ever infers that a task is done from the journey's
 * state. Booking a ticket is something only they know they did.
 *
 * The task is addressed by the engine's stable key rather than the row's uuid, so a
 * client never has to hold a database id — and a key that has stopped applying simply
 * matches nothing.
 *
 * RLS on `prepare_tasks` (`owns_journey`) is the control. A key belonging to someone
 * else's journey matches no row here, which is a 404 rather than a 403: confirming the
 * task exists would itself be the leak.
 */
const schema = z.object({
  /** e.g. `booking:<item-uuid>`. Bounded because it reaches a WHERE clause. */
  key: z.string().min(1).max(120),
  isDone: z.boolean(),
});

export const PATCH = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase }) => {
    const journeyId = journeyIdFrom(request);

    const changed = await setTaskDone(supabase, journeyId, input.key, input.isDone);
    if (!changed) throw new ApiError("not_found");

    return { key: input.key, isDone: input.isDone };
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
