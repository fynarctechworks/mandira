"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { opsAction } from "@/lib/action";

/**
 * Deciding a change candidate (PRD F18's Review queue, PRD-OPS-WF-001).
 *
 * THE CONSTRAINT THIS ACTION EXISTS TO HOLD: nothing here edits knowledge. "Accept" records
 * that an operator agrees the source changed. Correcting the fact is a separate edit that
 * goes through `publish_entity()` like every other change, with the same validation and the
 * same separation of duties.
 *
 * That is not caution for its own sake. If a review queue could publish, then a source
 * quietly rewriting its own page would rewrite what we tell travelers — which is precisely
 * the thing the whole trust model exists to prevent. The rule is enforced three times: in
 * `decide_change_candidate()` (which writes only the candidate and a review task), in RLS,
 * and here.
 *
 * "Edit & accept" from PRD F18 is deliberately a LINK to the entity editor rather than a
 * field on this form, for the same reason — the edit belongs on the other side of the gate.
 */
export const decideCandidate = opsAction({
  roles: ["admin", "editor", "reviewer"],
  input: z.object({
    id: z.string().uuid(),
    decision: z.enum(["accept", "reject", "request_verify"]),
    // Bounded, and required for a rejection — the database enforces that too, because a
    // queue that forgets why something was dismissed raises it again next cycle to
    // somebody with no context.
    reason: z.string().max(500).optional(),
  }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase.rpc("decide_change_candidate", {
      p_id: input.id,
      p_decision: input.decision,
      ...(input.reason ? { p_reason: input.reason } : {}),
    });

    if (error) {
      // The database's own refusals are the honest message here: "a rejection needs a
      // reason" is more useful than anything this layer could invent.
      throw new Error(error.message);
    }

    revalidatePath("/review");
    if (input.decision === "request_verify") revalidatePath("/trust");

    return data;
  },
});
