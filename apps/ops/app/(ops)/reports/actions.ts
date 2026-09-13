"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";
import { reportServerError } from "@/lib/report";

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
      // Never `user_id`: who filed a report is not Ops' to know (PRD §10, D-174).
      .select("id")
      .maybeSingle();

    if (error || !data) throw new Error("That report could not be updated.");

    /*
     * PRD-REPT-003's resolution loop. A traveler who took the trouble to tell us something
     * hears what came of it — Updated, Confirmed as correct, or Couldn't verify. A report
     * that vanishes into a queue is the last report that person files.
     *
     * The database queues the notice (0039): it reads the reporter inside a role-checked
     * function and tells this action only whether there was anyone to notify, so the id never
     * leaves Postgres. A notice that could not be queued does not undo the resolution.
     */
    const { error: noticeError } = await supabase.rpc("notify_report_resolution", {
      p_report_id: input.id,
    });
    if (noticeError) {
      reportServerError({ route: "resolveReport notice", error: noticeError, app: "ops" });
    }

    revalidatePath("/reports");
    return { id: data.id };
  },
});

export const triageReport = opsAction({
  roles: ["admin", "editor", "verifier", "support"],
  input: z.object({ id: z.string().uuid() }),
  handler: async ({ input, supabase }) => {
    // `triaged` means somebody has read it and it is real enough to look into — not that
    // anything has been decided.
    const { data: report, error } = await supabase
      .from("user_reports")
      .update({ status: "triaged" })
      .eq("id", input.id)
      .select("entity_table, entity_id, field_name")
      .maybeSingle();

    if (error || !report) throw new Error("That report could not be updated.");

    /*
     * PRD F18 Reports: "triage to Verify". A report is a T5 signal, never a fact, so what
     * it earns is a person checking the field against a real source — one open task per
     * field, matching the guard every other task producer uses.
     */
    const open = supabase
      .from("review_tasks")
      .select("id")
      .in("task_type", ["verify", "reverify"])
      .eq("entity_table", report.entity_table)
      .eq("entity_id", report.entity_id)
      .in("status", ["open", "in_progress"]);
    const { data: existing, error: existingError } = await (
      report.field_name === null
        ? open.is("field_name", null)
        : open.eq("field_name", report.field_name)
    ).limit(1);
    if (existingError) throw new Error("That report could not be updated.");

    if (!existing?.length) {
      const { error: taskError } = await supabase.from("review_tasks").insert({
        task_type: "verify",
        entity_table: report.entity_table,
        entity_id: report.entity_id,
        field_name: report.field_name,
        status: "open",
        priority: 2,
        notes: "From a traveler report.",
      });
      if (taskError) throw new Error("That report could not be sent to Verify.");
    }

    revalidatePath("/verify");

    revalidatePath("/reports");
    return { id: input.id };
  },
});
