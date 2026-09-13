"use server";

import { uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";
import { VERSIONED_TABLES } from "@/lib/audit";
import { editorPath } from "@/lib/entities";

/**
 * Restoring an earlier version (O20, PRD-OPS-WF-008).
 *
 * `restore_entity_version` writes the snapshot back and sends anything published back to
 * review: restored content is still content nobody has approved in its current form. The
 * role check is repeated in SQL.
 */
export const restoreEntityVersion = opsAction({
  roles: ["editor", "admin"],
  input: z.object({
    entity_table: z.enum(VERSIONED_TABLES),
    entity_id: uuid,
    version: z.number().int().positive(),
  }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase.rpc("restore_entity_version", {
      p_entity_table: input.entity_table,
      p_entity_id: input.entity_id,
      p_version: input.version,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("does not exist")) {
        throw Object.assign(new Error("missing"), {
          userMessage: "That version no longer exists.",
        });
      }
      if (message.includes("editor role")) {
        throw Object.assign(new Error("role"), {
          userMessage: "Restoring a version needs the editor role.",
        });
      }
      throw error;
    }

    revalidatePath(`/audit/${input.entity_table}/${input.entity_id}`);
    const editor = editorPath(input.entity_table, input.entity_id);
    if (editor) revalidatePath(editor);

    const result = data as { returned_to_review?: boolean } | null;
    return { returnedToReview: result?.returned_to_review === true };
  },
});
