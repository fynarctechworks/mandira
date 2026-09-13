import { LOCALES } from "@mandhira/i18n";
import { z } from "zod";

import { withApi } from "../../../lib/api";
import { searchKnowledge } from "../../../lib/knowledge";
import { searchFiltersFrom } from "../../../lib/search-filters";

/**
 * `GET /api/search` (TRD §5.2, PRD F2) — the same search the results screen runs.
 *
 * Guests may search; the limit is per session. Published knowledge only, through the views.
 */
const schema = z.object({
  q: z.string().max(200).default(""),
  type: z.string().max(40).optional(),
  access: z.string().max(20).optional(),
  duration: z.string().max(4).optional(),
  booking: z.string().max(4).optional(),
  on: z.string().max(10).optional(),
  near: z.string().max(36).optional(),
  locale: z.enum(LOCALES).default("en"),
});

export const GET = withApi({
  schema,
  rateLimit: "search",
  handler: async ({ input }) => {
    const results = await searchKnowledge(input.q, searchFiltersFrom(input), input.locale);
    return {
      experiences: results.experiences,
      places: results.places,
      filtersApplied: results.filtersApplied,
    };
  },
});
