import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { getJourney } from "../../../../../lib/journeys";

/**
 * "Start today" — activating Live Journey (PRD-LIVE-001).
 *
 * PRD F8 activates Live automatically at day-start on the first journey day, OR when the
 * traveler taps this. Both paths exist, and they do different things:
 *
 *   - Automatic activation is a READ-time decision. The Live screen is reachable whenever
 *     the journey's dates say the traveler is on it; nothing has to be written for that,
 *     and nothing should be — a journey that silently became `active` because someone's
 *     phone woke up at 6am is a state change nobody asked for.
 *   - This route is the explicit tap, and it is what MOVES the journey to `active`, which
 *     is a real state other things read (notifications, the journeys list).
 *
 * Ending is the mirror: `completed` when the traveler says so, never inferred from a clock
 * having passed midnight.
 */
const schema = z.object({
  action: z.enum(["start", "finish"]),
});

export const POST = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase }) => {
    const journeyId = journeyIdFrom(request);

    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");

    const status = input.action === "start" ? "active" : "completed";

    const { error } = await supabase.from("journeys").update({ status }).eq("id", journeyId);

    if (error) throw error;

    return { status };
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
