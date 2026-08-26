import { ReportsQueue, type ReportRow } from "@/components/reports-queue";
import { opsSupabase } from "@/lib/supabase";

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
      "id, report_type, entity_table, entity_id, field_name, description, status, locale, created_at, resolved_at, resolution_note, notified_user, user_id",
    )
    // Oldest unresolved first: a queue sorted newest-first is a queue where the oldest
    // report is never reached.
    .order("status")
    .order("created_at", { ascending: true })
    .limit(200);

  const rows = (data ?? []) as ReportRow[];
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
        <p className="text-body text-text-secondary">
          Nothing reported yet. That is the healthy state, not an empty one.
        </p>
      ) : (
        <ReportsQueue rows={rows} />
      )}
    </div>
  );
}
