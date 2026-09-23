import { getOpsRoles } from "@mandhira/db/client/roles";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";

import { ReportsQueue, type ReportRow } from "@/components/reports-queue";
import { mayViewReportPhotos, signReportPhotos } from "@/lib/report-photos";
import { opsSupabase } from "@/lib/supabase";
import { Inbox } from "lucide-react";
import { QueueEmpty } from "@/components/queue-empty";

export const metadata = { title: "Reports · Mandhira Ops" };

/**
 * The Reports queue (O-queue, PRD F14/F18, PRD-OPS-WF-005).
 *
 * Every row here is somebody who was standing in front of a place and found it different
 * from what we told them. That is the most valuable signal this product receives and the
 * weakest evidence it holds — tier T5 — and both of those are true at once.
 *
 * Nothing on this screen edits knowledge. Resolving a report records what an operator
 * found when they checked; correcting the underlying fact is a separate edit through the
 * publish gate. If resolving could edit, then three people repeating the same wrong thing
 * would eventually become the truth.
 */
export default async function ReportsPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("user_reports")
    .select(
      // No `user_id`: 0030 withholds it from every client role by column (PRD §10), so
      // asking for it refuses the whole read.
      "id, report_type, entity_table, entity_id, field_name, description, status, locale, created_at, resolved_at, resolution_note, notified_user, media_id",
    )
    // Oldest unresolved first: a queue sorted newest-first is a queue where the oldest
    // report is never reached.
    .order("status")
    .order("created_at", { ascending: true })
    .limit(200);

  const read = (data ?? []) as Omit<ReportRow, "photoUrl">[];

  /*
   * Report photos (PRD F14, D-016). Signed here, for 15 minutes, and only for reports the
   * operator just read through RLS — the ids come from that read, never from the request.
   * The role check repeats PRD §10's list rather than relying on the read being empty.
   */
  const photoIds = read.flatMap((row) => (row.media_id ? [row.media_id] : []));
  const signed =
    photoIds.length > 0 && mayViewReportPhotos(await getOpsRoles(supabase))
      ? await signReportPhotos(createServiceRoleSupabase(), photoIds)
      : null;

  const rows: ReportRow[] = read.map((row) => ({
    ...row,
    photoUrl: row.media_id ? (signed?.get(row.media_id) ?? null) : null,
  }));
  const open = rows.filter((row) => row.status === "new" || row.status === "triaged");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Reports</h1>
        <p className="text-body text-text-secondary">
          What travelers told us was different from what we published. A report is a signal, never a
          fact — resolving one records what you found, and correcting the knowledge itself is a
          separate edit through the publish gate.
        </p>
        {open.length > 0 ? (
          <p className="text-body-sm text-text-secondary">
            {open.length} waiting. Three independent reports on one field within 14 days
            automatically mark it &ldquo;check locally&rdquo; until it is resolved.
          </p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <QueueEmpty
          icon={Inbox}
          title="Nothing reported"
          description="That is the healthy state, not an empty one. When a traveler reports that something on the ground differs from what we show, it appears here."
        />
      ) : (
        <ReportsQueue rows={rows} />
      )}
    </div>
  );
}
