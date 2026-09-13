import { notFound } from "next/navigation";
import { LoadProblem } from "@/components/load-problem";
import {
  SourceActivity,
  type CandidateSummary,
  type CaptureRow,
} from "@/components/source-activity";
import { SourceForm, type SourceDraft } from "@/components/source-form";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Source · Mandhira Ops" };

/** O08 — one source (PRD F17): its registry record, its captures, and what they raised. */
export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [{ data, error }, captures, candidates] = await Promise.all([
    supabase.from("sources").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("source_captures")
      .select("id, captured_at, content_hash, diff_from_previous, ingestion_jobs(kind, status)")
      .eq("source_id", id)
      .order("captured_at", { ascending: false })
      .limit(50),
    supabase
      .from("change_candidates")
      .select(
        "id, entity_table, entity_id, field_name, status, excerpt, capture_id, created_at, decision_reason",
      )
      .eq("source_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h1">Source</h1>
        <LoadProblem />
      </div>
    );
  }
  if (!data) notFound();

  const initial: SourceDraft = {
    id: data.id,
    name: data.name,
    source_type: data.source_type as SourceDraft["source_type"],
    tier: data.tier,
    url: data.url ?? "",
    contact: data.contact ?? "",
    refresh_cadence_days: data.refresh_cadence_days,
    // `api` and `file_upload` exist in the schema but nothing runs them, so a source
    // carrying one reads as manual here rather than offering a method that does nothing.
    ingestion_method: data.ingestion_method === "url_monitor" ? "url_monitor" : "manual",
    status: data.status as SourceDraft["status"],
    notes: data.notes ?? "",
  };

  const captureRows: CaptureRow[] = (captures.data ?? []).map((capture) => ({
    id: capture.id,
    captured_at: capture.captured_at,
    content_hash: capture.content_hash,
    diff_from_previous: capture.diff_from_previous,
    run: capture.ingestion_jobs as { kind: string; status: string } | null,
  }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-h1">{initial.name}</h1>
        <p className="mt-1 text-body text-text-secondary">A registered source.</p>
      </header>
      <SourceForm initial={initial} />

      {captures.error || candidates.error ? (
        <LoadProblem title="Captures didn't load" />
      ) : (
        <SourceActivity
          captures={captureRows}
          candidates={(candidates.data ?? []) as CandidateSummary[]}
        />
      )}
    </div>
  );
}
