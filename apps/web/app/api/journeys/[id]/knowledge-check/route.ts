import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { checkKnowledgeUpdates } from "../../../../../lib/knowledge-updates";

/**
 * Has published knowledge changed under this journey? (PRD-OPS-WF-007)
 *
 * A POST rather than a GET, because it genuinely writes: it advances the journey's
 * `knowledge_checked_at` and, when something is found, records a Change Card. Doing that
 * during a page render would be a GET with side effects, and a prefetch would then answer
 * a traveler's card before they ever opened the screen.
 *
 * It runs as the TRAVELER. Building a card needs the travelers on the journey, and
 * `traveler_profiles` has no Ops policy at all (CLAUDE.md §5) — so this is the only place
 * the knowledge update and the people it affects can legally be in the same query.
 *
 * Returns a card, never an edit. An operator correcting a temple's evening timing must not
 * silently move somebody's evening; PRD Principle 6 has no exception for changes that are
 * obviously right.
 */
export const POST = withApi({
  schema: z.object({}).optional(),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ request, supabase }) => {
    const journeyId = journeyIdFrom(request);

    // RLS decides; a journey the caller does not own simply yields nothing to check.
    const event = await checkKnowledgeUpdates(supabase, journeyId, "en");

    return event ? { event: { id: event.id, card: event.card } } : { event: null };
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
