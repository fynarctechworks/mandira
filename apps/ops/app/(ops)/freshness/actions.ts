"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { opsAction } from "@/lib/action";

/**
 * Bulk "assign re-verification" (PRD F18's Freshness monitor, PRD-OPS-WF-006).
 *
 * Assigning is a narrower act than looking, and the roles say so: a researcher can see
 * what is going stale without being able to put it on somebody else's desk. Enforced in
 * `assign_reverification()` as well as here, because a Server Action is an addressable
 * endpoint rather than merely a function this page happens to call.
 *
 * The function refuses to create a second open task for a field that already has one. A
 * monitor that grows a duplicate every time somebody taps the button is a monitor whose
 * numbers stop meaning anything within a week.
 */
export const assignReverification = opsAction({
  roles: ["admin", "editor", "verifier"],
  input: z.object({
    // Bounded: this is a bulk action on a screen, not an import.
    trustIds: z.array(z.string().uuid()).min(1).max(200),
    note: z.string().max(500).optional(),
  }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase.rpc("assign_reverification", {
      p_trust_ids: input.trustIds,
      ...(input.note ? { p_note: input.note } : {}),
    });

    if (error) throw new Error(error.message);

    revalidatePath("/freshness");
    return { created: (data as number | null) ?? 0 };
  },
});
