import { ConflictsQueue, type ConflictRow } from "@/components/conflicts-queue";
import { opsSupabase } from "@/lib/supabase";
import { Scale } from "lucide-react";
import { QueueEmpty } from "@/components/queue-empty";

export const metadata = { title: "Conflicts · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * O12 — Conflicts (PRD F18, PRD-OPS-WF-003).
 *
 * Every row is a field two sources disagree about. That is already reaching travelers: the
 * flag drops the field to low confidence, so somebody planning around it is being told to
 * check locally. Settling it is what turns that back into a usable fact.
 *
 * WHY THESE ARE ALL RAISED BY HAND TODAY. PRD-OPS-SRC-005 wants them opened automatically
 * when two sources of tier ≤T3 give different values — which needs per-source claimed
 * values, and `trust_records` is unique per field with nowhere to keep a second claim. The
 * only producer of such claims is AI extraction, which needs a key nobody has (ACCT-04).
 * That is OPEN-014: recorded for the founder rather than resolved by inventing a schema.
 * Everything downstream of the raise works now, and auto-detection will call the same
 * function when extraction lands.
 */
export default async function ConflictsPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("conflicts")
    .select(
      "id, entity_table, entity_id, field_name, values, status, winner_source_id, resolution_reason, resolved_at, created_at",
    )
    // Oldest open first: a queue sorted newest-first is one where the oldest is never read.
    .order("status")
    .order("created_at", { ascending: true })
    .limit(200);

  const conflicts = data ?? [];

  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, tier")
    .in("status", ["active", "paused"])
    .order("name");

  const rows: ConflictRow[] = conflicts.map((row) => ({
    id: row.id,
    entityTable: row.entity_table,
    entityId: row.entity_id,
    fieldName: row.field_name,
    values: (row.values as { source_id?: string; tier?: string; value?: string }[]) ?? [],
    status: row.status,
    winnerSourceId: row.winner_source_id,
    resolutionReason: row.resolution_reason,
    createdAt: row.created_at,
  }));

  const open = rows.filter((row) => row.status === "open");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Conflicts</h1>
        <p className="text-body text-text-secondary">
          Fields two sources disagree about. While one is open, travelers are shown that field as
          low confidence — so settling it is what turns it back into something they can plan around.
        </p>
        <p className="text-body-sm text-text-secondary">
          Recording a decision here does not change the value. Correcting the fact is a separate
          edit through the publish gate, so no source can rewrite what we publish by being the
          loudest.
        </p>
        {open.length > 0 ? (
          <p className="text-body-sm text-text-secondary">{open.length} waiting, oldest first.</p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <QueueEmpty
          icon={Scale}
          title="No source disagreements recorded"
          description="That is the healthy state, not an empty one. Conflicts are raised from a field's trust panel when two sources do not match; automatic detection needs AI extraction, which is waiting on a provider key."
        />
      ) : (
        <ConflictsQueue rows={rows} sources={sources ?? []} />
      )}
    </div>
  );
}
