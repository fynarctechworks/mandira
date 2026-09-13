"use server";

import { uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";
import { clearsVerification } from "@/lib/verify-rows";

/**
 * Claiming and closing verification work (O11, PRD-OPS-WF-002).
 *
 * Neither action changes a trust record: the check itself is recorded through the trust
 * panel's `saveTrustRecord`, which holds the per-status role table. These only say who is
 * doing the check, and that it is done. Roles are the `trust_records` writers in 0008.
 */
const VERIFY_ROLES = ["reviewer", "verifier", "editor", "admin"] as const;

const refuse = (userMessage: string) => Object.assign(new Error("refused"), { userMessage });

export const claimVerification = opsAction({
  roles: VERIFY_ROLES,
  input: z.union([
    z.object({ task_id: uuid }),
    z.object({
      entity_table: z.enum([
        "places",
        "experiences",
        "availability_rules",
        "transport_connections",
      ]),
      entity_id: uuid,
      field_name: z.string().min(1).nullable(),
    }),
  ]),
  handler: async ({ input, supabase, userId }) => {
    let taskId: string | null = "task_id" in input ? input.task_id : null;

    if (!("task_id" in input)) {
      const existing = supabase
        .from("review_tasks")
        .select("id")
        .eq("task_type", "verify")
        .eq("entity_table", input.entity_table)
        .eq("entity_id", input.entity_id)
        .in("status", ["open", "in_progress"]);
      const { data, error } = await (
        input.field_name === null
          ? existing.is("field_name", null)
          : existing.eq("field_name", input.field_name)
      ).maybeSingle();
      if (error) throw error;
      taskId = data?.id ?? null;

      if (!taskId) {
        const { error: insertError } = await supabase.from("review_tasks").insert({
          task_type: "verify",
          entity_table: input.entity_table,
          entity_id: input.entity_id,
          field_name: input.field_name,
          status: "in_progress",
          assigned_to: userId,
          priority: 2,
          notes: "Claimed from the Verify queue.",
        });
        if (insertError) throw insertError;
        revalidatePath("/verify");
        return { claimed: true };
      }
    }

    const { data: updated, error } = await supabase
      .from("review_tasks")
      .update({ assigned_to: userId, status: "in_progress" })
      .eq("id", taskId as string)
      .is("assigned_to", null)
      .in("status", ["open", "in_progress"])
      .select("id");
    if (error) throw error;

    if (updated.length === 0) {
      const { data: current } = await supabase
        .from("review_tasks")
        .select("assigned_to")
        .eq("id", taskId as string)
        .maybeSingle();
      if (current?.assigned_to !== userId) {
        throw refuse("Somebody else claimed this a moment ago.");
      }
    }

    revalidatePath("/verify");
    return { claimed: true };
  },
});

export const completeVerification = opsAction({
  roles: VERIFY_ROLES,
  input: z.object({ task_id: uuid }),
  handler: async ({ input, supabase, userId }) => {
    const { data: task, error } = await supabase
      .from("review_tasks")
      .select("id, entity_table, entity_id, field_name, status")
      .eq("id", input.task_id)
      .eq("task_type", "verify")
      .maybeSingle();
    if (error) throw error;
    if (!task || !task.entity_table || !task.entity_id) throw refuse("That task no longer exists.");

    const trust = supabase
      .from("trust_records")
      .select("verification_status")
      .eq("entity_table", task.entity_table)
      .eq("entity_id", task.entity_id);
    const { data: record, error: trustError } = await (
      task.field_name === null
        ? trust.is("field_name", null)
        : trust.eq("field_name", task.field_name)
    ).maybeSingle();
    if (trustError) throw trustError;

    if (!clearsVerification(record?.verification_status)) {
      throw refuse(
        "Record what you checked in the trust panel first. The field needs to be reviewed by a person or verified before this can close.",
      );
    }

    const { data: closed, error: closeError } = await supabase
      .from("review_tasks")
      .update({ status: "done", completed_by: userId, completed_at: new Date().toISOString() })
      .eq("id", task.id)
      .in("status", ["open", "in_progress"])
      .select("id");
    if (closeError) throw closeError;
    if (closed.length === 0) {
      throw refuse("This is claimed by somebody else, so only they or an admin can close it.");
    }

    revalidatePath("/verify");
    revalidatePath("/");
    return { done: true };
  },
});
