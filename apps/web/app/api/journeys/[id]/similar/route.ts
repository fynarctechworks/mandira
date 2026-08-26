import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { similarBrief } from "../../../../../lib/record";

/**
 * The brief for "plan a similar journey" (PRD-CMPL-003).
 *
 * Reads a finished journey and hands back what a NEW brief would need — travelers, pace,
 * and the tiers the traveler assigned. It creates nothing: the caller opens the preview,
 * and the traveler decides whether to keep it. A single tap that silently produced a second
 * journey would be the auto-applied change PRD Principle 6 forbids.
 *
 * The destination comes back as a SLUG rather than a uuid, because the preview's brief
 * lives in the URL (D-089/D-093) and a slug is the half of that a person can read.
 */
export const GET = withApi({
  schema: z.object({}).optional(),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ request, supabase }) => {
    const journeyId = journeyIdFrom(request);

    // RLS means another traveler's journey is not visible at all, so this is a 404.
    const brief = await similarBrief(supabase, journeyId);
    if (!brief) throw new ApiError("not_found");

    const { data: destination } = brief.destinationId
      ? await supabase
          .from("v_published_destinations")
          .select("slug")
          .eq("id", brief.destinationId)
          .maybeSingle()
      : { data: null };

    /*
     * The strictest mobility in the group, matching how the brief collects it (D-094). The
     * engine takes the most constrained limit anyway, and asking for a full roster again
     * would collect more about people than the answer needs.
     */
    const mobility = strictestOf(brief.travelers.map((traveler) => traveler.mobility));

    return {
      destinationSlug: destination?.slug ?? null,
      dayCount: brief.dayCount,
      pace: brief.pace,
      mustDo: brief.mustDo,
      wouldLike: brief.wouldLike,
      travelerCount: brief.travelers.length,
      mobility,
    };
  },
});

/** Most constrained first — the same order the engine's buffer rules apply. */
function strictestOf(mobilities: string[]): string {
  for (const level of ["wheelchair", "needs_rest_frequently", "limited_walking"]) {
    if (mobilities.includes(level)) return level;
  }
  return "full";
}

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
