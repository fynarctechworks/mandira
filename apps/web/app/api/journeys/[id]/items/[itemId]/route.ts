import { ApiError } from "@mandhira/db/api";
import type { Database } from "@mandhira/db/types";
import { checkItemAction, type ItemAction } from "@mandhira/journey-engine";
import { z } from "zod";

import { withApi } from "../../../../../../lib/api";
import { getJourney } from "../../../../../../lib/journeys";
import { resyncNotifications } from "../../../../../../lib/notifications";

/**
 * Item mutations (TRD §5.2, PRD-PLAN-003).
 *
 * PRD-PLAN-002's tier rules are enforced HERE, not in the screen. Hiding a button is never
 * a control (CLAUDE.md §4) — a crafted PATCH must meet the same refusal a tap would, and
 * the tests hit this route directly rather than the UI to prove it.
 *
 * RLS is underneath all of it: the request-scoped client cannot see another traveler's
 * item at all, so a mismatched id is a 404 rather than a 403 — which is also the right
 * answer, since confirming that someone else's item exists is itself a leak.
 */
const patchSchema = z
  .object({
    tier: z.enum(["fixed", "protected", "important", "optional"]).optional(),
    dayIndex: z.number().int().min(0).max(30).optional(),
    preferredWindowStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time.")
      .nullish(),
    bufferMinutes: z.number().int().min(0).max(240).optional(),
    note: z.string().max(500).nullish(),
    /**
     * PRD Principle 6: a state-changing journey action needs the traveler to have said yes
     * to THIS change. A client that omits it is refused rather than assumed to have asked.
     */
    confirmed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "confirmed"), {
    message: "Nothing to change.",
  });

/** Which rule governs each field, so one PATCH cannot smuggle a move past a buffer edit. */
function actionsIn(input: z.infer<typeof patchSchema>): ItemAction[] {
  const actions: ItemAction[] = [];
  if (input.tier !== undefined) actions.push("retier");
  if (input.dayIndex !== undefined || input.preferredWindowStart !== undefined) {
    actions.push("move");
  }
  if (input.bufferMinutes !== undefined) actions.push("set_buffer");
  if (input.note !== undefined) actions.push("annotate");
  return actions;
}

export const PATCH = withApi({
  schema: patchSchema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase, user }) => {
    const { journeyId, itemId } = idsFrom(request);
    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");

    const item = detail.items.find((i) => i.id === itemId);
    if (!item) throw new ApiError("not_found");

    for (const action of actionsIn(input)) {
      const verdict = checkItemAction(item.tier, action);
      if (!verdict.allowed) throw new ApiError("forbidden", refusal(verdict.reasonKey));
      if (verdict.requiresConfirmation && !input.confirmed) {
        throw new ApiError("invalid", "That needs confirming before it takes effect.");
      }
    }

    // Typed as the table's Update row so a column name typo is a compile error rather than
    // a PATCH that silently changes nothing.
    const patch: Database["public"]["Tables"]["journey_items"]["Update"] = {};
    if (input.tier !== undefined) patch.tier = input.tier;
    if (input.dayIndex !== undefined) patch.day_index = input.dayIndex;
    if (input.preferredWindowStart !== undefined) {
      patch.preferred_window_start = input.preferredWindowStart;
    }
    if (input.bufferMinutes !== undefined) patch.buffer_minutes = input.bufferMinutes;
    if (input.note !== undefined) patch.note = input.note;

    const { error } = await supabase
      .from("journey_items")
      .update(patch)
      .eq("id", itemId)
      .eq("journey_id", journeyId);

    if (error) throw error;

    // Fresh items AND fresh health. Returning one without the other lets a screen show
    // yesterday's verdict on today's plan.
    await resyncNotifications(supabase, journeyId, user!.id, "journey item change");
    const updated = await getJourney(supabase, journeyId, "en");
    return { items: updated?.items ?? [], health: updated?.health ?? null };
  },
});

export const DELETE = withApi({
  /*
   * DELETE takes its input from the query string, so `confirmed` arrives as text.
   * NOT `z.coerce.boolean()`: that is `Boolean("false")`, which is true — so
   * `?confirmed=false` would confirm a removal. Only the literal "true" counts.
   */
  schema: z.object({ confirmed: z.literal("true").optional() }),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase, user }) => {
    const { journeyId, itemId } = idsFrom(request);
    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");

    const item = detail.items.find((i) => i.id === itemId);
    if (!item) throw new ApiError("not_found");

    const verdict = checkItemAction(item.tier, "remove");
    if (!verdict.allowed) throw new ApiError("forbidden", refusal(verdict.reasonKey));
    if (input.confirmed !== "true") {
      throw new ApiError("invalid", "Removing something needs confirming first.");
    }

    // Soft: the row carries `deleted_at`, and a traveler who removes the wrong thing in a
    // queue at 5am should not have destroyed it.
    const { error } = await supabase
      .from("journey_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("journey_id", journeyId);

    if (error) throw error;

    await resyncNotifications(supabase, journeyId, user!.id, "journey item change");
    const updated = await getJourney(supabase, journeyId, "en");
    return { items: updated?.items ?? [], health: updated?.health ?? null };
  },
});

/**
 * The rule keys turned into sentences a traveler can act on.
 *
 * Kept beside the route rather than in the engine for the same reason health causes are:
 * the engine states rules, not language.
 */
function refusal(reasonKey: string): string {
  return (
    {
      "plan.rule.fixed_cannot_move":
        "That one can't move — it's a fixed time. Change its tier first if it really can.",
      "plan.rule.fixed_cannot_remove":
        "That one can't be removed while it's fixed. Change its tier first if it really can go.",
      "plan.rule.protected_cannot_remove":
        "You marked that as something you must do, so Mandhira won't remove it. Change its tier if that's no longer true.",
      "plan.rule.item_not_found": "We couldn't find that.",
    }[reasonKey] ?? "That can't be changed."
  );
}

/** Route params, read from the URL because `withApi` hands the raw request through. */
function idsFrom(request: Request): { journeyId: string; itemId: string } {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const itemId = parts.at(-1) ?? "";
  const journeyId = parts.at(-3) ?? "";
  return { journeyId, itemId };
}
