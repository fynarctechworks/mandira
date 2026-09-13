import { criticalFieldsFor } from "@mandhira/db";
import { createAiCacheStore, createAiCallLog } from "@mandhira/db/ai-store";
import { rateLimit } from "@mandhira/db/rate-limit";
import type { createServiceRoleSupabase } from "@mandhira/db/client/server";
import {
  AiUnavailableError,
  createVercelAiProvider,
  errorCode,
  isAiConfigured,
  type AiProvider,
  type KnowledgeTarget,
} from "@mandhira/providers";

type Client = ReturnType<typeof createServiceRoleSupabase>;

/** The capture is compared against at most this many entities, cited by the source first. */
const MAX_TARGETS = 50;

export type ExtractionOutcome =
  | { status: "not_configured" }
  | { status: "no_targets" }
  | { status: "recorded"; candidates: number; conflicts: number; skipped: number; rejected: number }
  | { status: "unavailable"; code: string };

/**
 * AI extraction for one capture (PRD F17, PRD-OPS-SRC-003).
 *
 * The model is asked only about entities this source already vouches for, and only about
 * their critical fields plus the fields the source is cited on. Its claims are grounded in
 * code before they leave the provider, and `record_extraction` (0034) turns them into review
 * work and conflicts — never into knowledge.
 *
 * Runs under the service role with the ingestion runner, for the same reason captures do.
 */
export async function extractFromCapture(input: {
  supabase: Client;
  captureId: string;
  sourceId: string;
  sourceName: string;
  captureText: string;
  provider?: AiProvider;
  env?: NodeJS.ProcessEnv;
  /** The operator who started the run; scheduled runs share one budget. */
  actor?: string | null;
  limit?: typeof rateLimit;
}): Promise<ExtractionOutcome> {
  const env = input.env ?? process.env;
  if (!input.provider && !isAiConfigured(env)) return { status: "not_configured" };

  const targets = await targetsForSource(input.supabase, input.sourceId);
  if (targets.length === 0) return { status: "no_targets" };

  /*
   * TRD §6.2 `ops_ai_extract`: at most 60 extractions a day per operator, and one shared budget
   * for scheduled runs, so a source that changes on every fetch cannot run up the model bill.
   * Counted only once there is something to ask about. A refusal reads like the model being
   * unavailable: the capture is already stored, and review proceeds without suggestions.
   */
  const allowance = await (input.limit ?? rateLimit)(
    input.supabase,
    "ops_ai_extract",
    input.actor ? `operator:${input.actor}` : "scheduled",
  );
  if (!allowance.allowed) return { status: "unavailable", code: "rate_limited" };

  const provider =
    input.provider ??
    createVercelAiProvider({
      cache: createAiCacheStore(input.supabase),
      log: createAiCallLog(input.supabase),
      env,
    });

  try {
    const { value, meta } = await provider.extractKnowledge({
      captureText: input.captureText,
      sourceName: input.sourceName,
      locale: "en",
      targets,
    });

    const { data, error } = await input.supabase.rpc("record_extraction", {
      p_capture_id: input.captureId,
      p_provider: meta.provider,
      p_model: meta.model,
      p_claims: value.claims.map((claim) => ({
        entity_table: claim.entityTable,
        entity_id: claim.entityId,
        field_name: claim.fieldName,
        value: claim.value,
        excerpt: claim.excerpt,
        locale: claim.locale,
        confidence: claim.confidence,
      })),
    });
    if (error) throw error;

    const recorded = data as { candidates: number; conflicts: number; skipped: number };
    return {
      status: "recorded",
      candidates: recorded.candidates,
      conflicts: recorded.conflicts,
      skipped: recorded.skipped,
      rejected: value.rejected.length,
    };
  } catch (cause) {
    if (cause instanceof AiUnavailableError)
      return { status: "unavailable", code: errorCode(cause) };
    throw cause;
  }
}

async function targetsForSource(supabase: Client, sourceId: string): Promise<KnowledgeTarget[]> {
  const { data, error } = await supabase
    .from("trust_records")
    .select("entity_table, entity_id, field_name")
    .eq("source_id", sourceId)
    .limit(500);
  if (error) throw error;

  const entities = new Map<string, { table: string; id: string; fields: Set<string> }>();
  for (const row of data ?? []) {
    const key = `${row.entity_table}:${row.entity_id}`;
    const entity = entities.get(key) ?? {
      table: row.entity_table,
      id: row.entity_id,
      fields: new Set<string>(),
    };
    if (row.field_name) entity.fields.add(row.field_name);
    for (const critical of criticalFieldsFor(row.entity_table)) {
      if (critical.field) entity.fields.add(critical.field);
    }
    entities.set(key, entity);
  }

  const chosen = [...entities.values()].filter((e) => e.fields.size > 0).slice(0, MAX_TARGETS);
  const names = await namesFor(supabase, chosen);

  return chosen.map((entity) => ({
    entityTable: entity.table,
    entityId: entity.id,
    name: names.get(entity.id) ?? entity.table.replace(/_/g, " "),
    fields: [...entity.fields],
  }));
}

/** English names for the entities that have one, so the model can tell them apart. */
async function namesFor(
  supabase: Client,
  entities: { table: string; id: string }[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  for (const table of ["destinations", "places", "experiences", "routes"] as const) {
    const ids = entities.filter((e) => e.table === table).map((e) => e.id);
    if (ids.length === 0) continue;

    const { data, error } = await supabase.from(table).select("id, name_i18n").in("id", ids);
    if (error) throw error;

    for (const row of data ?? []) {
      const name = (row.name_i18n as Record<string, string> | null)?.["en"];
      if (name) names.set(row.id, name);
    }
  }

  return names;
}
