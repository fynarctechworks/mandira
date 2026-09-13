import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { removeTraveler, travelerSchema, updateTraveler } from "../../../../lib/account";
import { withApi } from "../../../../lib/api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = travelerSchema
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Nothing to change.",
  });

export const PATCH = withApi({
  schema: patchSchema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase }) => {
    const traveler = await updateTraveler(supabase, travelerIdFrom(request), {
      ...(input.label !== undefined ? { label: input.label || null } : {}),
      ...(input.mobility ? { mobility: input.mobility } : {}),
      ...(input.ageBand ? { ageBand: input.ageBand } : {}),
    });

    // RLS hides another account's travelers, so theirs and a missing one are the same answer.
    if (!traveler) throw new ApiError("not_found");
    return { traveler };
  },
});

export const DELETE = withApi({
  schema: z.object({}),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ request, supabase }) => {
    const outcome = await removeTraveler(supabase, travelerIdFrom(request));

    if (outcome === "not_found") throw new ApiError("not_found");
    if (outcome === "is_self") {
      throw new ApiError("forbidden", "This is you, so it stays on your account.");
    }
    return { removed: true };
  },
});

function travelerIdFrom(request: Request): string {
  const id = new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (!UUID.test(id)) throw new ApiError("not_found");
  return id;
}
