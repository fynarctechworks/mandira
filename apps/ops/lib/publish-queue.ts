import { editorPath, type PublishableTable } from "./entities";
import { validationProblems } from "./entity-review";
import { blockedReason, candidateLabel, type CandidateSource } from "./publish-rows";
import { opsSupabase } from "./supabase";

/** Loads O13: everything in review across the eight publishable tables, and the schedule. */

export type PublishCandidate = {
  table: PublishableTable;
  id: string;
  label: string;
  href: string | null;
  inReviewSince: string;
  problems: { field: string; message: string }[];
};

export type ScheduleRow = {
  id: string;
  table: string;
  entityId: string;
  label: string;
  href: string | null;
  publishAt: string;
  status: "scheduled" | "blocked";
  reason: string | null;
};

/** A blocked schedule stays listed for a month: long enough to be noticed, not forever. */
const BLOCKED_WINDOW_MS = 30 * 86_400_000;

type Query = PromiseLike<{ data: unknown[] | null; error: unknown }>;

export async function loadPublishQueue(): Promise<{
  candidates: PublishCandidate[];
  schedules: ScheduleRow[];
}> {
  const supabase = await opsSupabase();

  const inReview: Record<PublishableTable, Query> = {
    destinations: supabase
      .from("destinations")
      .select("id, slug, name_i18n, updated_at")
      .eq("status", "in_review")
      .is("deleted_at", null),
    places: supabase
      .from("places")
      .select("id, slug, name_i18n, updated_at")
      .eq("status", "in_review")
      .is("deleted_at", null),
    experiences: supabase
      .from("experiences")
      .select("id, slug, name_i18n, updated_at")
      .eq("status", "in_review")
      .is("deleted_at", null),
    routes: supabase
      .from("routes")
      .select("id, slug, name_i18n, updated_at")
      .eq("status", "in_review")
      .is("deleted_at", null),
    transport_connections: supabase
      .from("transport_connections")
      .select("id, mode, operator, from_place_id, to_place_id, updated_at")
      .eq("status", "in_review"),
    guidance_blocks: supabase
      .from("guidance_blocks")
      .select("id, guidance_type, body_i18n, updated_at")
      .eq("status", "in_review")
      .is("deleted_at", null),
    phrases: supabase
      .from("phrases")
      .select("id, source_text, updated_at")
      .eq("status", "in_review"),
    advisories: supabase
      .from("advisories")
      .select("id, title_i18n, updated_at")
      .eq("status", "in_review"),
  };

  const tables = Object.keys(inReview) as PublishableTable[];
  const [results, schedules] = await Promise.all([
    Promise.all(tables.map((table) => inReview[table])),
    supabase
      .from("publish_schedules")
      .select("id, entity_table, entity_id, publish_at, status, outcome, updated_at")
      .in("status", ["scheduled", "blocked"])
      .order("publish_at")
      .limit(200),
  ]);

  const rowsByTable = new Map<string, CandidateSource[]>();
  tables.forEach((table, index) => {
    const result = results[index];
    if (!result || result.error) throw result?.error ?? new Error(`${table} did not load`);
    rowsByTable.set(table, (result.data ?? []) as CandidateSource[]);
  });
  if (schedules.error) throw schedules.error;

  const now = Date.now();
  const listed = schedules.data.filter(
    (row) => row.status === "scheduled" || now - Date.parse(row.updated_at) < BLOCKED_WINDOW_MS,
  );

  // Scheduled entities are usually still in review, but need not be — name the rest too.
  const known = new Set(
    [...rowsByTable.entries()].flatMap(([table, rows]) => rows.map((row) => `${table}:${row.id}`)),
  );
  const missing = new Map<string, string[]>();
  for (const row of listed) {
    if (!known.has(`${row.entity_table}:${row.entity_id}`)) {
      missing.set(row.entity_table, [...(missing.get(row.entity_table) ?? []), row.entity_id]);
    }
  }
  const extra = new Map<string, CandidateSource[]>();
  await Promise.all(
    [...missing.entries()].map(async ([table, ids]) => {
      const query = byIds(supabase, table, ids);
      if (!query) return;
      const { data, error } = await query;
      if (error) throw error;
      extra.set(table, (data ?? []) as CandidateSource[]);
    }),
  );

  const legs = [
    ...(rowsByTable.get("transport_connections") ?? []),
    ...(extra.get("transport_connections") ?? []),
  ];
  const placeIds = [
    ...new Set(
      legs
        .flatMap((leg) => [leg["from_place_id"], leg["to_place_id"]])
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const placeNames = new Map<string, string>();
  if (placeIds.length > 0) {
    const { data, error } = await supabase
      .from("places")
      .select("id, slug, name_i18n")
      .in("id", placeIds);
    if (error) throw error;
    for (const place of data) placeNames.set(place.id, candidateLabel("places", place));
  }

  const candidates: PublishCandidate[] = await Promise.all(
    tables.flatMap((table) =>
      (rowsByTable.get(table) ?? []).map(async (row) => ({
        table,
        id: row.id,
        label: candidateLabel(table, row, placeNames),
        href: editorPath(table, row.id),
        inReviewSince: String(row["updated_at"]),
        problems: await validationProblems(table, row.id),
      })),
    ),
  );

  const labelFor = (table: string, id: string) => {
    const row =
      rowsByTable.get(table)?.find((r) => r.id === id) ??
      extra.get(table)?.find((r) => r.id === id);
    return row ? candidateLabel(table, row, placeNames) : "No longer exists";
  };

  return {
    candidates,
    schedules: listed.map((row) => ({
      id: row.id,
      table: row.entity_table,
      entityId: row.entity_id,
      label: labelFor(row.entity_table, row.entity_id),
      href: editorPath(row.entity_table, row.entity_id),
      publishAt: row.publish_at,
      status: row.status as "scheduled" | "blocked",
      reason: row.status === "blocked" ? blockedReason(row.outcome) : null,
    })),
  };
}

function byIds(
  supabase: Awaited<ReturnType<typeof opsSupabase>>,
  table: string,
  ids: string[],
): Query | null {
  switch (table) {
    case "destinations":
    case "places":
    case "experiences":
    case "routes":
      return supabase.from(table).select("id, slug, name_i18n").in("id", ids);
    case "transport_connections":
      return supabase
        .from("transport_connections")
        .select("id, mode, operator, from_place_id, to_place_id")
        .in("id", ids);
    case "guidance_blocks":
      return supabase.from("guidance_blocks").select("id, guidance_type, body_i18n").in("id", ids);
    case "phrases":
      return supabase.from("phrases").select("id, source_text").in("id", ids);
    case "advisories":
      return supabase.from("advisories").select("id, title_i18n").in("id", ids);
    default:
      return null;
  }
}
