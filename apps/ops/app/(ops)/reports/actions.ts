"use server";

import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";

/**
 * Resolving a report (PRD F14, PRD-REPT-002/003, PRD-OPS-WF-005).
 *
 * A report is a SIGNAL — tier T5, the weakest evidence the trust model has — and resolving
 * it never publishes anything. What an operator records here is what they found when they
 * checked against a real source; changing the underlying fact is a separate edit that goes
 * through the normal publish gate, exactly as it would if nobody had reported anything.
 *
 * That separation is the point. If resolving a report could edit knowledge, then three
 * people saying the same wrong thing would eventually become the truth.
 */
const resolution = z.enum([
  // The report was right and the fact has been corrected (separately, through the gate).
  "resolved_updated",
  // Checked, and what we had was already correct.
  "resolved_confirmed_correct",
  // Could not be established either way — said plainly rather than guessed at.
  "resolved_unverifiable",
]);

export const resolveReport = opsAction({
  /*
   * AUTHORIZATION_MODEL is explicit: the reports queue belongs to `support`, and reports
   * are readable to support/verifier/editor/admin. `verifier` is included because
   * resolving a report often means checking it against a source, which is that role's
   * whole job — and excluding them would mean the person who did the verifying cannot
   * record the outcome.
   */
  roles: ["admin", "editor", "verifier", "support"],
  input: z.object({
    id: z.string().uuid(),
    status: resolution,
    note: z.string().max(500).optional(),
  }),
  handler: async ({ input, supabase, userId }) => {
    const { data, error } = await supabase
      .from("user_reports")
      .update({
        status: input.status,
        resolution_note: input.note ?? null,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .select("id, user_id, notified_user")
      .maybeSingle();

    if (error || !data) throw new Error("That report could not be updated.");

    /*
     * PRD-REPT-003's resolution loop. A traveler who took the trouble to tell us something
     * hears what came of it — Updated, Confirmed as correct, or Couldn't verify. A report
     * that vanishes into a queue is the last report that person files.
     *
     * Only when there IS a traveler to tell: a guest report carries a reporter hash and no
     * account, which is the trade guest reporting makes.
     */
    if (data.user_id && !data.notified_user) {
      await notifyReporter(data.user_id, input.status);

      await supabase.from("user_reports").update({ notified_user: true }).eq("id", input.id);
    }

    revalidatePath("/reports");
    return { id: data.id };
  },
});

/**
 * Queue the traveler's notification.
 *
 * Service-role, for the same reason the journey scheduler is (D-125): `notifications`
 * grants no INSERT to any client role, because scheduling is the product's decision. An
 * operator resolving a report is not the notification's recipient, so nothing else would
 * be able to write this row.
 */
async function notifyReporter(userId: string, status: string): Promise<void> {
  const outcome =
    status === "resolved_updated"
      ? "updated"
      : status === "resolved_confirmed_correct"
        ? "confirmed"
        : "unverified";

  const row = {
    user_id: userId,
    notification_type: "report_resolved" as const,
    status: "scheduled",
    scheduled_for: new Date().toISOString(),
    // Keys and params, never a sentence — the traveler's language is decided at send
    // time, not at the moment an operator happened to click.
    title_i18n: { key: "notify.report_resolved.title" },
    body_i18n: { key: "notify.report_resolved.body" },
    payload: { outcome },
  };

  /*
   * In the app always; by email only if the traveler opted in. Ops learns neither which nor
   * the address: the email row is queued unconditionally, and the sender checks consent and
   * looks the address up at send time, cancelling the row when either is missing (D-171).
   */
  await createServiceRoleSupabase()
    .from("notifications")
    .insert([
      { ...row, channel: "inapp" },
      { ...row, channel: "email" },
    ]);
}

export const triageReport = opsAction({
  roles: ["admin", "editor", "verifier", "support"],
  input: z.object({ id: z.string().uuid() }),
  handler: async ({ input, supabase }) => {
    // `triaged` means somebody has read it and it is real enough to look into — not that
    // anything has been decided.
    const { error } = await supabase
      .from("user_reports")
      .update({ status: "triaged" })
      .eq("id", input.id);

    if (error) throw new Error("That report could not be updated.");

    revalidatePath("/reports");
    return { id: input.id };
  },
});
