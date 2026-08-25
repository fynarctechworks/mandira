"use server";

import { i18nText, uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asRow, opsAction } from "@/lib/action";

/**
 * Guidance blocks (O07, OPS-EDIT-06) — the practical notes attached to a destination,
 * place or experience: what to carry, etiquette, timing tips, safety.
 *
 * These become Prepare tasks and in-journey notes, so they are written by editors and
 * still pass through the publish gate like everything else.
 */
const guidanceType = z.enum([
  "before_you_go",
  "what_to_carry",
  "etiquette",
  "timing_tip",
  "safety",
  "family",
  "accessibility",
]);

const guidanceFields = {
  guidance_type: guidanceType,
  body_i18n: i18nText.refine(
    (v) => Object.values(v).some((text) => text.trim() !== ""),
    "Write the guidance in at least one language",
  ),
  applies_to_table: z.enum(["destinations", "places", "experiences"]),
  applies_to_id: uuid,
  sort_order: z.number().int().nonnegative().default(0),
};

export const saveGuidanceBlock = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: z.object({ id: uuid.optional(), ...guidanceFields }),
  handler: async ({ input, supabase }) => {
    const { id, ...fields } = input;

    if (id) {
      const { error } = await supabase.from("guidance_blocks").update(asRow(fields)).eq("id", id);
      if (error) throw error;
      revalidatePath("/guidance");
      return { id };
    }

    const { data, error } = await supabase
      .from("guidance_blocks")
      .insert(asRow(fields))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/guidance");
    return { id: data.id };
  },
});

export const archiveGuidanceBlock = opsAction({
  roles: ["editor", "admin"],
  input: z.object({ id: uuid }),
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from("guidance_blocks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) throw error;

    revalidatePath("/guidance");
    return { id: input.id };
  },
});
