import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../lib/api";
import { savePlace, unsavePlace } from "../../../lib/saved-places";

/** Saving and unsaving a place (PRD F13, A22). Both are idempotent, so a double tap is harmless. */
const schema = z.object({ placeId: z.string().uuid() });

export const POST = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, supabase, user }) => {
    if (!(await savePlace(supabase, user!.id, input.placeId))) throw new ApiError("not_found");
    return { saved: true };
  },
});

export const DELETE = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, supabase, user }) => {
    await unsavePlace(supabase, user!.id, input.placeId);
    return { saved: false };
  },
});
