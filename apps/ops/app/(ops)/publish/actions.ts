"use server";

import { uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";
import { opsSupabase } from "@/lib/supabase";

/**
 * Submit / approve / publish (O13, OPS-PUB-01/02, PRD-OPS-WF-004).
 *
 * The gate itself lives in SQL (`publish_entity`, 0011): validation, the approver role and
 * separation of duties are all enforced there, so nothing here can be the thing that lets
 * an unverified fact through. This module is the operator's route to it, and its job is to
 * turn a raised exception back into a sentence naming the field.
 */

const publishable = z.enum([
  "destinations",
  "places",
  "experiences",
  "routes",
  "transport_connections",
  "guidance_blocks",
  "phrases",
  "advisories",
]);

const target = z.object({ entity_table: publishable, entity_id: uuid });

/** Moves a draft into review. Anyone who can edit can ask for a second pair of eyes. */
export const submitForReview = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: target,
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from(input.entity_table)
      .update({ status: "in_review" })
      .eq("id", input.entity_id);
    if (error) throw error;

    revalidatePath("/publish");
    revalidatePath(`/${input.entity_table}`);
    return { status: "in_review" as const };
  },
});

export const returnToDraft = opsAction({
  roles: ["reviewer", "editor", "approver", "admin"],
  input: target,
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from(input.entity_table)
      .update({ status: "draft" })
      .eq("id", input.entity_id);
    if (error) throw error;

    revalidatePath("/publish");
    return { status: "draft" as const };
  },
});

/**
 * Publishes, or explains exactly why it cannot.
 *
 * The SQL function raises with the problem list embedded; PRD F18's acceptance requires the
 * refusal to name the field, so the message is parsed back out rather than replaced with a
 * generic apology.
 */
export const publishEntity = opsAction({
  roles: ["approver", "admin"],
  input: target,
  handler: async ({ input, supabase }) => {
    const { error } = await supabase.rpc("publish_entity", {
      p_entity_table: input.entity_table,
      p_entity_id: input.entity_id,
    });

    if (error) {
      const message = error.message ?? "";

      if (message.includes("Separation of duties")) {
        throw Object.assign(new Error("separation"), {
          userMessage:
            "You made the last change to this, so it needs a different approver. That separation is deliberate.",
        });
      }
      if (message.includes("approver role")) {
        throw Object.assign(new Error("role"), {
          userMessage: "Publishing needs the approver role.",
        });
      }
      if (message.includes("Not ready to publish")) {
        throw Object.assign(new Error("validation"), {
          userMessage: "Some things still need attention before this can go out.",
        });
      }
      throw error;
    }

    revalidatePath("/publish");
    revalidatePath(`/${input.entity_table}`);
    return { status: "published" as const };
  },
});

/** What is still blocking publication, straight from the same function the gate uses. */
export async function validationProblems(
  entityTable: string,
  entityId: string,
): Promise<{ field: string; message: string }[]> {
  const supabase = await opsSupabase();
  const { data, error } = await supabase.rpc("validate_for_publish", {
    p_entity_table: entityTable,
    p_entity_id: entityId,
  });

  if (error || !Array.isArray(data)) return [];
  return data as { field: string; message: string }[];
}
