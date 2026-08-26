import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import {
  createHttpCaptureProvider,
  detectChangeCandidates,
  diffCaptures,
  formatDiff,
  type CaptureProvider,
  type EvidenceRecord,
} from "@mandhira/providers";

/**
 * The ingestion runner (PRD F17, PRD-OPS-SRC-002/004).
 *
 * SOURCE → COLLECT → (diff) → change candidates. One run of one source: fetch it, store
 * the capture, compare it with the previous one, and open a candidate for every published
 * field whose evidence has disappeared from its own source.
 *
 * Runs under the SERVICE ROLE, and that needs justifying. A capture is written on behalf of
 * the system rather than of the operator who tapped "Run now" — the same reasoning as the
 * notification sender (D-125) — and the `captures` BUCKET deliberately has no insert policy
 * for `authenticated`, because an operator hand-uploading a "capture" would be evidence
 * nobody fetched. Authorization happens before we get here: the Server Action checks the
 * role, and `decide_change_candidate` checks it again for the decisions.
 *
 * A failure is RECORDED, never swallowed. A run that quietly skips is indistinguishable
 * from a source that has not changed — the same mistake `unavailable` weather readings
 * exist to avoid (D-132).
 */

export type RunOutcome = {
  jobId: string;
  status: "succeeded" | "failed";
  /** Null when the fetch failed or the page was byte-identical to the last capture. */
  captureId: string | null;
  unchanged: boolean;
  candidatesOpened: number;
  fieldsChecked: number;
  fieldsSkipped: number;
  error: string | null;
};

/** A cron invocation has a time budget and a monitored source is somebody else's server. */
const CRON_BATCH = 10;

/**
 * The provider is injectable, and that is a testing decision worth stating.
 *
 * The SSRF guard refuses loopback and private addresses, which is correct and which also
 * means no test can point this at a local fixture server. Relaxing the guard for tests is
 * the kind of "temporarily" CLAUDE.md §5 forbids, so the seam moves instead: the HTTP
 * provider is tested on its own, and the runner can be driven with a stub that returns a
 * capture without a network.
 */
export async function runIngestionForSource(
  sourceId: string,
  kind: "manual" | "scheduled",
  triggeredBy: string | null,
  provider: CaptureProvider = createHttpCaptureProvider(),
): Promise<RunOutcome> {
  const supabase = createServiceRoleSupabase();

  const { data: source } = await supabase
    .from("sources")
    .select("id, name, url, ingestion_method, status")
    .eq("id", sourceId)
    .maybeSingle();

  const { data: job, error: jobError } = await supabase
    .from("ingestion_jobs")
    .insert({
      source_id: sourceId,
      kind,
      status: "running",
      started_at: new Date().toISOString(),
      ...(triggeredBy ? { triggered_by: triggeredBy } : {}),
    })
    .select("id")
    .single();

  /*
   * If the run cannot even be recorded there is nowhere to record that it failed, so this
   * is the one place the runner throws. Everything after this point writes its outcome to
   * the job row instead — the whole point being that a failure is visible on O09 rather
   * than lost.
   */
  if (jobError || !job) {
    throw new Error(`Could not start an ingestion run: ${jobError?.message ?? "no row returned"}`);
  }

  const jobId = job.id;
  const fail = (error: string) => finish(supabase, jobId, error);

  if (!source) return fail("That source no longer exists.");
  // Retired means the team stopped trusting it, not that we watch it quietly.
  if (source.status === "retired") return fail("This source is retired, so it is not fetched.");
  if (source.ingestion_method !== "url_monitor") {
    return fail(`Only url_monitor sources are fetched; this one is ${source.ingestion_method}.`);
  }
  if (!source.url) return fail("This source has no URL to fetch.");

  const capture = await provider.fetchCapture(source.url);
  if (!capture.ok) {
    return fail(`Could not read the source (${capture.reason}${detail(capture.detail)}).`);
  }

  // The most recent capture is the only one we compare against. Older ones are kept as
  // evidence, not as history to walk.
  const { data: previous } = await supabase
    .from("source_captures")
    .select("id, content_hash, storage_path")
    .eq("source_id", sourceId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previous?.content_hash === capture.contentHash) {
    /*
     * Byte-identical. The RUN is still recorded — "we looked and it had not changed" is a
     * fact an operator needs — but no second copy of the same page is stored.
     */
    await supabase
      .from("ingestion_jobs")
      .update({ status: "succeeded", finished_at: new Date().toISOString() })
      .eq("id", jobId);

    return {
      jobId,
      status: "succeeded",
      captureId: null,
      unchanged: true,
      candidatesOpened: 0,
      fieldsChecked: 0,
      fieldsSkipped: 0,
      error: null,
    };
  }

  const previousText = previous?.storage_path
    ? await readCapture(supabase, previous.storage_path)
    : null;

  const storagePath = `${sourceId}/${capture.contentHash}.txt`;
  const { error: uploadError } = await supabase.storage
    .from("captures")
    .upload(storagePath, capture.text, { contentType: "text/plain; charset=utf-8", upsert: true });

  if (uploadError) return fail(`Could not store the capture: ${uploadError.message}`);

  const diff = previousText === null ? null : diffCaptures(previousText, capture.text);

  const { data: stored, error: storeError } = await supabase
    .from("source_captures")
    .insert({
      source_id: sourceId,
      captured_at: capture.capturedAt,
      storage_path: storagePath,
      content_hash: capture.contentHash,
      ingestion_job_id: jobId,
      ...(diff ? { diff_from_previous: formatDiff(diff) } : {}),
    })
    .select("id")
    .single();

  if (storeError || !stored) {
    return fail(`Could not record the capture: ${storeError?.message ?? "no row returned"}`);
  }

  const captureId = stored.id;

  /*
   * Which published fields cite THIS source. `trust_records.evidence_excerpt` is the exact
   * text an operator read when they verified the field, which is what makes deterministic
   * change detection possible without a model — see `detectChangeCandidates`.
   */
  const { data: evidenceRows } = await supabase
    .from("trust_records")
    .select("entity_table, entity_id, field_name, evidence_excerpt")
    .eq("source_id", sourceId);

  const evidence: EvidenceRecord[] = (evidenceRows ?? []).map((row) => ({
    entityTable: row.entity_table,
    entityId: row.entity_id,
    fieldName: row.field_name,
    excerpt: row.evidence_excerpt,
  }));

  const detection = detectChangeCandidates({
    currentText: capture.text,
    previousText,
    evidence,
  });

  let opened = 0;
  for (const change of detection.changes) {
    const { error } = await supabase.rpc("open_change_candidate", {
      p_entity_table: change.entityTable,
      p_entity_id: change.entityId,
      p_field_name: change.fieldName,
      p_source_id: sourceId,
      p_capture_id: captureId,
      p_excerpt: change.excerpt,
    });
    if (!error) opened++;
  }

  await supabase
    .from("ingestion_jobs")
    .update({ status: "succeeded", finished_at: new Date().toISOString() })
    .eq("id", jobId);

  return {
    jobId,
    status: "succeeded",
    captureId,
    unchanged: false,
    candidatesOpened: opened,
    fieldsChecked: detection.changes.length + detection.skipped.length,
    fieldsSkipped: detection.skipped.length,
    error: null,
  };
}

/**
 * Every monitored source whose cadence is up (PRD-OPS-SRC-004's "within one cycle").
 *
 * A source with no `refresh_cadence_days` is fetched daily: somebody marked it as worth
 * watching and did not say how often, and watching it too often is a smaller mistake than
 * never watching it at all.
 */
export async function runDueIngestion(): Promise<RunOutcome[]> {
  const supabase = createServiceRoleSupabase();

  const { data: sources } = await supabase
    .from("sources")
    .select("id, refresh_cadence_days")
    .eq("ingestion_method", "url_monitor")
    .in("status", ["active", "paused"])
    .limit(200);

  const due: string[] = [];

  for (const source of sources ?? []) {
    const { data: last } = await supabase
      .from("source_captures")
      .select("captured_at")
      .eq("source_id", source.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!last) {
      due.push(source.id);
      continue;
    }

    const days = source.refresh_cadence_days ?? 1;
    const nextDue = Date.parse(last.captured_at) + days * 86_400_000;
    if (Date.now() >= nextDue) due.push(source.id);

    if (due.length >= CRON_BATCH) break;
  }

  const outcomes: RunOutcome[] = [];
  // Sequentially on purpose: these are other people's servers, and a cron that fans out
  // ten simultaneous requests at one temple's host is the kind of guest that gets blocked.
  for (const id of due) {
    outcomes.push(await runIngestionForSource(id, "scheduled", null));
  }

  return outcomes;
}

type Client = ReturnType<typeof createServiceRoleSupabase>;

async function readCapture(supabase: Client, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("captures").download(path);
  if (error || !data) return null;
  return data.text();
}

async function finish(supabase: Client, jobId: string, error: string): Promise<RunOutcome> {
  await supabase
    .from("ingestion_jobs")
    .update({ status: "failed", finished_at: new Date().toISOString(), error })
    .eq("id", jobId);

  return {
    jobId,
    status: "failed",
    captureId: null,
    unchanged: false,
    candidatesOpened: 0,
    fieldsChecked: 0,
    fieldsSkipped: 0,
    error,
  };
}

function detail(text: string | undefined): string {
  return text ? `: ${text}` : "";
}
