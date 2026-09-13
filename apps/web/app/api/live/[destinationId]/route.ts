import { ApiError } from "@mandhira/db/api";
import { LOCALES } from "@mandhira/i18n";
import { z } from "zod";

import { withApi } from "../../../../lib/api";
import { getLiveConditions } from "../../../../lib/live-conditions";

/**
 * `GET /api/live/:destinationId` — live conditions with provider and time (TRD §5.2, PRD F10).
 *
 * The same reading the Live screen shows. A degraded feed carries its label and no values, so
 * nothing here can present an old reading as a current one.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withApi({
  schema: z.object({ locale: z.enum(LOCALES).default("en") }),
  rateLimit: "search",
  handler: async ({ input, request, supabase }) => {
    const destinationId = new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (!UUID.test(destinationId)) throw new ApiError("not_found");

    const conditions = await getLiveConditions(supabase, destinationId, input.locale);

    return {
      feeds: conditions.map((condition) => ({
        kind: condition.feedKind,
        provider: condition.provider,
        readAt: condition.readAt,
        status: condition.degraded ? "unavailable" : "ok",
        label: condition.label,
        data: { hours: condition.hours, disruptive: condition.disruptive },
      })),
    };
  },
});
