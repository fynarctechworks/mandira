import { IngestionRuns, type MonitoredSource } from "@/components/ingestion-runs";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Ingestion · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * O09 — Ingestion & AI extraction (PRD F17, PRD-OPS-SRC-002/004).
 *
 * What this screen answers is "when did we last actually look, and did anything move?".
 * Today the honest answer for every source is "when somebody remembered", which is why a
 * temple's changed timing reaches us through a traveler standing at the gate.
 *
 * AI extraction has its own column and no rows: `ai_extractions` exists, nothing writes it
 * until there is a key (ACCT-04). Shown as absent rather than hidden, so the gap is legible
 * to whoever is looking at the queue rather than a surprise later.
 */
export default async function IngestionPage() {
  const supabase = await opsSupabase();

  const { data: sources, error } = await supabase
    .from("sources")
    .select("id, name, tier, url, status, refresh_cadence_days, ingestion_method")
    .eq("ingestion_method", "url_monitor")
    .order("name");

  const ids = (sources ?? []).map((source) => source.id);

  // Two small reads rather than a join, because PostgREST cannot express "the latest row
  // per group" and pulling every capture ever taken to find the newest would not scale.
  const [{ data: jobs }, { data: captures }, { data: candidates }] = await Promise.all([
    ids.length
      ? supabase
          .from("ingestion_jobs")
          .select("id, source_id, kind, status, started_at, finished_at, error")
          .in("source_id", ids)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] },
    ids.length
      ? supabase
          .from("source_captures")
          .select("id, source_id, captured_at, content_hash, diff_from_previous")
          .in("source_id", ids)
          .order("captured_at", { ascending: false })
          .limit(200)
      : { data: [] },
    ids.length
      ? supabase
          .from("change_candidates")
          .select("id, source_id")
          .in("source_id", ids)
          .eq("status", "open")
      : { data: [] },
  ]);

  const rows: MonitoredSource[] = (sources ?? []).map((source) => ({
    id: source.id,
    name: source.name,
    tier: source.tier,
    url: source.url,
    status: source.status,
    cadenceDays: source.refresh_cadence_days,
    lastJob: (jobs ?? []).find((job) => job.source_id === source.id) ?? null,
    lastCapture: (captures ?? []).find((capture) => capture.source_id === source.id) ?? null,
    openCandidates: (candidates ?? []).filter((row) => row.source_id === source.id).length,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Ingestion</h1>
        <p className="text-body text-text-secondary">
          Sources we watch on a schedule. Each run stores what the page said and compares it with
          the last one. When the text a published field was verified against disappears, a change
          candidate opens in the Review queue with that excerpt.
        </p>
        <p className="text-body-sm text-text-secondary">
          Nothing here edits knowledge. A run can only raise a question for somebody to answer.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4">
          <p className="text-body">No source is being watched yet.</p>
          <p className="text-body-sm text-text-secondary">
            A source is watched when its ingestion method is <strong>URL monitor</strong> and it has
            a URL. Set that on any source in the registry and it will appear here.
          </p>
        </div>
      ) : (
        <IngestionRuns rows={rows} />
      )}

      <section className="flex flex-col gap-1 rounded-lg border border-border bg-bg-surface p-4">
        <h2 className="text-h3">AI extraction</h2>
        <p className="text-body-sm text-text-secondary">
          Not available yet — it needs an AI provider key. When it arrives it will propose a value
          for each change candidate from the capture, always marked{" "}
          <strong>AI extracted</strong>, always landing in the Review queue, and never able to
          publish. Until then a candidate says what disappeared, not what replaced it.
        </p>
      </section>
    </div>
  );
}
