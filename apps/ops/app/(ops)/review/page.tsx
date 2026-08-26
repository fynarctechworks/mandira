import { ReviewQueue, type CandidateRow } from "@/components/review-queue";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Review queue · Mandhira Ops" };
export const dynamic = "force-dynamic";

/** The entity tables a candidate can point at, mapped to where an operator edits them. */
const EDITOR_PATH: Record<string, string> = {
  destinations: "/destinations",
  places: "/places",
  experiences: "/experiences",
  routes: "/routes",
  transport_connections: "/transport",
};

/**
 * O10 — the Review queue (PRD F18, PRD-OPS-WF-001).
 *
 * Every row is a published field whose evidence has disappeared from the source it was
 * verified against. That is a question, not an answer: the page changed, and somebody has
 * to decide what it means.
 *
 * Nothing on this screen edits knowledge, and the screen says so out loud. "Edit & accept"
 * from PRD F18 is a LINK to the entity editor rather than a field here — the edit belongs
 * on the other side of the publish gate, where validation and separation of duties still
 * apply. A queue that could publish would let a source quietly rewrite what we tell
 * travelers, which is the one thing the trust model exists to prevent.
 */
export default async function ReviewPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("change_candidates")
    // One literal, not a concatenation: the generated types read the select string to
    // infer the row shape, and a concatenated one degrades every column to `unknown`.
    .select(
      "id, entity_table, entity_id, field_name, old_value, new_value, excerpt, status, created_at, decided_at, decision_reason, source_id, capture_id",
    )
    // Oldest open first. A queue sorted newest-first is a queue where the oldest item is
    // never reached — the same rule the Reports queue follows.
    .order("status")
    .order("created_at", { ascending: true })
    .limit(200);

  const candidates = data ?? [];
  const sourceIds = [...new Set(candidates.map((row) => row.source_id).filter(Boolean))];

  const { data: sources } = sourceIds.length
    ? await supabase.from("sources").select("id, name, tier").in("id", sourceIds as string[])
    : { data: [] };

  const sourceById = new Map((sources ?? []).map((source) => [source.id, source]));

  const rows: CandidateRow[] = candidates.map((row) => ({
    id: row.id,
    entityTable: row.entity_table,
    entityId: row.entity_id,
    fieldName: row.field_name,
    excerpt: row.excerpt,
    status: row.status,
    createdAt: row.created_at,
    decisionReason: row.decision_reason,
    proposed: row.new_value === null ? null : String(row.new_value),
    sourceName: row.source_id ? (sourceById.get(row.source_id)?.name ?? null) : null,
    sourceTier: row.source_id ? (sourceById.get(row.source_id)?.tier ?? null) : null,
    editorPath:
      row.entity_id && EDITOR_PATH[row.entity_table]
        ? `${EDITOR_PATH[row.entity_table]}/${row.entity_id}`
        : null,
  }));

  const open = rows.filter((row) => row.status === "open");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Review queue</h1>
        <p className="text-body text-text-secondary">
          Published fields whose source no longer shows the text they were verified against. Each
          one is a question — the page changed, and somebody has to decide what it means.
        </p>
        <p className="text-body-sm text-text-secondary">
          Deciding here records what you found. Changing the fact itself is a separate edit through
          the publish gate, so nothing a source does can reach a traveler on its own.
        </p>
        {open.length > 0 ? (
          <p className="text-body-sm text-text-secondary">
            {open.length} waiting, oldest first.
          </p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-body text-text-secondary">
          Nothing waiting. That is the healthy state, not an empty one — it means every watched
          source still says what we recorded.
        </p>
      ) : (
        <ReviewQueue rows={rows} />
      )}
    </div>
  );
}
