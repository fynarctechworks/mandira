"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { opsAction } from "@/lib/action";

/**
 * Opening and resolving a conflict (PRD F18, PRD-OPS-SRC-005, PRD-OPS-WF-003).
 *
 * Raised by hand until AI extraction can produce per-source claims. `trust_records` is
 * unique per field, so the schema has nowhere to hold "source B says 18:00" beside source
 * A's 18:30 — that is OPEN-014, recorded rather than worked around by inventing a table.
 * What an operator does here is exactly what they do today when they read two sources and
 * find they disagree.
 *
 * Nothing here edits knowledge. Resolving records which source was judged right and clears
 * the flag; correcting the value is a separate edit through the publish gate. If a queue
 * could publish, whichever source shouted loudest would become the truth.
 */
const value = z.object({
  source_id: z.string().uuid(),
  tier: z.string().max(4).optional(),
  value: z.string().min(1).max(500),
});

export const openConflict = opsAction({
  roles: ["admin", "editor", "verifier"],
  input: z.object({
    entityTable: z.string().min(1).max(64),
    entityId: z.string().uuid(),
    fieldName: z.string().min(1).max(64),
    // Two at minimum, because one value is a correction rather than a disagreement.
    values: z.array(value).min(2).max(6),
  }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase.rpc("open_conflict", {
      p_entity_table: input.entityTable,
      p_entity_id: input.entityId,
      p_field_name: input.fieldName,
      p_values: input.values,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/conflicts");
    revalidatePath(`/${input.entityTable}/${input.entityId}`);
    return { id: data as string };
  },
});

export const resolveConflict = opsAction({
  roles: ["admin", "editor", "verifier"],
  input: z.object({
    id: z.string().uuid(),
    resolution: z.enum(["winner", "both_valid", "escalate"]),
    // Required for every outcome — the database enforces it too. A settled conflict with
    // no reasoning is a field that looks decided and cannot be re-examined.
    reason: z.string().min(1).max(1000),
    winnerSourceId: z.string().uuid().optional(),
  }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase.rpc("resolve_conflict", {
      p_id: input.id,
      p_resolution: input.resolution,
      p_reason: input.reason,
      ...(input.winnerSourceId ? { p_winner_source_id: input.winnerSourceId } : {}),
    });

    if (error) throw new Error(error.message);

    revalidatePath("/conflicts");
    revalidatePath("/freshness");
    return data;
  },
});
