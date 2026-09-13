"use server";

import { uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";

/**
 * Submit / approve / publish / schedule (O13, OPS-PUB-01/02, PRD-OPS-WF-004).
 *
 * The gate itself lives in SQL (`publish_entity_as`, 0032): validation, the approver role and
 * separation of duties are all enforced there — for an immediate publish and again when a
 * scheduled one runs — so nothing here can be the thing that lets an unverified fact
 * through. This module is the operator's route to it, and its job is to turn a raised
 * exception back into a sentence naming the problem.
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

function refusal(message: string): Error | null {
  const say = (userMessage: string) => Object.assign(new Error("refused"), { userMessage });

  if (message.includes("Separation of duties")) {
    return say(
      "You made the last change to this, so it needs a different approver. That separation is deliberate.",
    );
  }
  if (message.includes("approver role")) return say("Publishing needs the approver role.");
  if (message.includes("Not ready to publish")) {
    return say("Some things still need attention before this can go out.");
  }
  if (message.includes("time in the future")) {
    return say("Choose a time in the future, or publish now.");
  }
  return null;
}

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

    if (error) throw refusal(error.message ?? "") ?? error;

    revalidatePath("/publish");
    revalidatePath(`/${input.entity_table}`);
    return { status: "published" as const };
  },
});

/**
 * Schedules a publish. Checked now, and checked again by the job when the time comes — an
 * entity edited in between still has to be valid and still needs a different approver.
 */
export const schedulePublish = opsAction({
  roles: ["approver", "admin"],
  input: target.extend({ publish_at: z.iso.datetime({ offset: true }) }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase.rpc("schedule_publish", {
      p_entity_table: input.entity_table,
      p_entity_id: input.entity_id,
      p_publish_at: input.publish_at,
    });

    if (error) throw refusal(error.message ?? "") ?? error;

    revalidatePath("/publish");
    return { scheduleId: data };
  },
});

export const cancelScheduledPublish = opsAction({
  roles: ["approver", "admin"],
  input: z.object({ schedule_id: uuid }),
  handler: async ({ input, supabase }) => {
    const { error } = await supabase.rpc("cancel_scheduled_publish", {
      p_schedule_id: input.schedule_id,
    });
    if (error) throw refusal(error.message ?? "") ?? error;

    revalidatePath("/publish");
    return { cancelled: true };
  },
});
