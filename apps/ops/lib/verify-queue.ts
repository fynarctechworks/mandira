import { criticalFieldsFor } from "@mandhira/db";
import { editorPath, labelOf } from "./entities";
import { opsSupabase } from "./supabase";
import { rankVerifyRows, type VerifyRow, type VerifyTrust } from "./verify-rows";

/**
 * Loads the Verify queue (O11, PRD-OPS-WF-002): critical-field trust records still short of
 * `verified` on entities in review or published, plus every open `verify` and `reverify` task — including
 * ones on fields already verified, because those are the fields whose source changed.
 */

const TRUST_TABLES = ["places", "experiences", "availability_rules", "transport_connections"];
const LIVE = new Set(["in_review", "published"]);
const TRUST_COLUMNS =
  "id, entity_table, entity_id, field_name, source_id, verification_status, verified_at, valid_until, evidence_url, evidence_excerpt, conflict_flag, needs_reverification, freshness, confidence";

type TrustRow = VerifyTrust & { entity_table: string; entity_id: string };
type Named = { label: string; status: string; href: string | null };

async function whereIdIn<T>(
  ids: Set<string>,
  run: (ids: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  if (ids.size === 0) return [];
  const { data, error } = await run([...ids]);
  if (error) throw error;
  return data ?? [];
}

const fieldKey = (table: string, id: string, field: string | null) =>
  `${table}:${id}:${field ?? ""}`;

export async function loadVerifyQueue(): Promise<{
  rows: VerifyRow[];
  sources: { id: string; label: string; tier: string }[];
}> {
  const supabase = await opsSupabase();

  const [gaps, tasks, sources] = await Promise.all([
    supabase
      .from("trust_records")
      .select(TRUST_COLUMNS)
      .in("entity_table", TRUST_TABLES)
      .neq("verification_status", "verified")
      .limit(1000),
    supabase
      .from("review_tasks")
      .select("id, entity_table, entity_id, field_name, status, assigned_to, notes, created_at")
      // A nightly re-verification of a stale field is verification work too (TRD §5.4).
      .in("task_type", ["verify", "reverify"])
      .in("status", ["open", "in_progress"])
      .order("created_at")
      .limit(500),
    supabase.from("sources").select("id, name, tier, status").order("tier").order("name"),
  ]);
  if (gaps.error) throw gaps.error;
  if (tasks.error) throw tasks.error;
  if (sources.error) throw sources.error;

  const openTasks = tasks.data.filter((task) => task.entity_table && task.entity_id);
  const taskEntityIds = new Set(openTasks.map((task) => task.entity_id as string));

  const trustByKey = new Map<string, TrustRow>();
  for (const record of gaps.data as TrustRow[]) {
    const critical = criticalFieldsFor(record.entity_table).some(
      (f) => f.field === record.field_name,
    );
    if (critical)
      trustByKey.set(fieldKey(record.entity_table, record.entity_id, record.field_name), record);
  }

  const [taskTrust, rules, transport] = await Promise.all([
    whereIdIn(taskEntityIds, (ids) =>
      supabase.from("trust_records").select(TRUST_COLUMNS).in("entity_id", ids),
    ),
    whereIdIn(idsFor("availability_rules", trustByKey, openTasks), (ids) =>
      supabase.from("availability_rules").select("id, experience_id").in("id", ids),
    ),
    whereIdIn(idsFor("transport_connections", trustByKey, openTasks), (ids) =>
      supabase
        .from("transport_connections")
        .select("id, mode, operator, status, from_place_id, to_place_id")
        .in("id", ids),
    ),
  ]);

  for (const record of taskTrust as TrustRow[]) {
    const key = fieldKey(record.entity_table, record.entity_id, record.field_name);
    if (!trustByKey.has(key)) trustByKey.set(key, record);
  }

  const placeIds = idsFor("places", trustByKey, openTasks);
  for (const leg of transport) {
    if (leg.from_place_id) placeIds.add(leg.from_place_id);
    if (leg.to_place_id) placeIds.add(leg.to_place_id);
  }
  const experienceIds = idsFor("experiences", trustByKey, openTasks);
  for (const rule of rules) experienceIds.add(rule.experience_id);

  const [places, experiences, routes, destinations] = await Promise.all([
    whereIdIn(placeIds, (ids) =>
      supabase.from("places").select("id, slug, name_i18n, status").in("id", ids),
    ),
    whereIdIn(experienceIds, (ids) =>
      supabase.from("experiences").select("id, slug, name_i18n, status").in("id", ids),
    ),
    whereIdIn(idsFor("routes", trustByKey, openTasks), (ids) =>
      supabase.from("routes").select("id, slug, name_i18n, status").in("id", ids),
    ),
    whereIdIn(idsFor("destinations", trustByKey, openTasks), (ids) =>
      supabase.from("destinations").select("id, slug, name_i18n, status").in("id", ids),
    ),
  ]);

  const named = new Map<string, Named>();
  const nameAll = (
    table: string,
    list: { id: string; slug: string; name_i18n: unknown; status: string }[],
  ) => {
    for (const row of list) {
      named.set(`${table}:${row.id}`, {
        label: labelOf(row.name_i18n, row.slug),
        status: row.status,
        href: editorPath(table, row.id),
      });
    }
  };
  nameAll("places", places);
  nameAll("experiences", experiences);
  nameAll("routes", routes);
  nameAll("destinations", destinations);

  for (const leg of transport) {
    const from = leg.from_place_id ? named.get(`places:${leg.from_place_id}`)?.label : null;
    const to = leg.to_place_id ? named.get(`places:${leg.to_place_id}`)?.label : null;
    named.set(`transport_connections:${leg.id}`, {
      label: [leg.operator, leg.mode.replace(/_/g, " "), from && `from ${from}`, to && `to ${to}`]
        .filter(Boolean)
        .join(" "),
      status: leg.status,
      href: editorPath("transport_connections", leg.id),
    });
  }
  for (const rule of rules) {
    const experience = named.get(`experiences:${rule.experience_id}`);
    if (experience) {
      named.set(`availability_rules:${rule.id}`, {
        label: `${experience.label} — availability`,
        status: experience.status,
        href: `/experiences/${rule.experience_id}`,
      });
    }
  }

  const sourceById = new Map(sources.data.map((source) => [source.id, source]));
  const taskByKey = new Map(
    openTasks.map((task) => [
      fieldKey(task.entity_table as string, task.entity_id as string, task.field_name),
      task,
    ]),
  );

  const keys = new Set<string>();
  for (const [key, record] of trustByKey) {
    const entity = named.get(`${record.entity_table}:${record.entity_id}`);
    if (entity && LIVE.has(entity.status)) keys.add(key);
  }
  for (const key of taskByKey.keys()) keys.add(key);

  const rows: VerifyRow[] = [];
  for (const key of keys) {
    const record = trustByKey.get(key) ?? null;
    const task = taskByKey.get(key) ?? null;
    const table = record?.entity_table ?? (task?.entity_table as string);
    const id = record?.entity_id ?? (task?.entity_id as string);
    const field = record ? record.field_name : (task?.field_name ?? null);
    const entity = named.get(`${table}:${id}`);
    if (!entity) continue;

    const critical = criticalFieldsFor(table).find((f) => f.field === field) ?? null;
    const source = record?.source_id ? sourceById.get(record.source_id) : undefined;

    rows.push({
      key,
      entityTable: table,
      entityId: id,
      fieldName: field,
      fieldLabel: critical?.label ?? (field ? field.replace(/_/g, " ") : "Whole record"),
      entityLabel: entity.label,
      entityStatus: entity.status,
      editorHref: entity.href,
      panelField: critical
        ? { field: critical.field, label: critical.label, why: critical.why }
        : null,
      trust: record
        ? {
            id: record.id,
            field_name: record.field_name,
            source_id: record.source_id,
            verification_status: record.verification_status,
            verified_at: record.verified_at,
            valid_until: record.valid_until,
            evidence_url: record.evidence_url,
            evidence_excerpt: record.evidence_excerpt,
            conflict_flag: record.conflict_flag,
            needs_reverification: record.needs_reverification,
            freshness: record.freshness,
            confidence: record.confidence,
          }
        : null,
      sourceName: source?.name ?? null,
      sourceTier: source?.tier ?? null,
      task: task
        ? {
            id: task.id,
            status: task.status,
            assignedTo: task.assigned_to,
            notes: task.notes,
            createdAt: task.created_at,
          }
        : null,
    });
  }

  return {
    rows: rankVerifyRows(rows),
    sources: sources.data
      .filter((source) => source.status !== "retired")
      .map((source) => ({ id: source.id, label: source.name, tier: source.tier })),
  };
}

function idsFor(
  table: string,
  trust: Map<string, TrustRow>,
  tasks: { entity_table: string | null; entity_id: string | null }[],
): Set<string> {
  const ids = new Set<string>();
  for (const record of trust.values()) if (record.entity_table === table) ids.add(record.entity_id);
  for (const task of tasks)
    if (task.entity_table === table && task.entity_id) ids.add(task.entity_id);
  return ids;
}
