import { LOCALES } from "@mandhira/i18n";
import { z } from "zod";

import { withApi } from "../../../../lib/api";
import { extractJourneyBrief } from "../../../../lib/intent";

/**
 * `POST /api/intent/extract` — a traveler's words → a Journey Brief to review (PRD F3, TRD §5.2).
 *
 * Open to guests, because describing a journey is the first thing a visitor does, and limited
 * per device by `intent_extract` (10/hour, 30/day). With no model configured it answers
 * `unavailable` rather than failing, so the planner offers the structured form (TRD §5.5).
 */
const schema = z.object({
  text: z.string().trim().min(3).max(1000),
  locale: z.enum(LOCALES),
  destinationHint: z.string().trim().min(1).max(120).optional(),
});

export const POST = withApi({
  schema,
  rateLimit: "intent_extract",
  handler: async ({ input }) => extractJourneyBrief(input),
});
