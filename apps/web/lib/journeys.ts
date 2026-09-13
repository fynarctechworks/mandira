import { computeHealth, type HealthReport, type JourneyItem } from "@mandhira/journey-engine";

import { mustList, mustMaybe } from "./data-error";
import { dayCountOf, toEngineJourney, type StoredItem, type StoredJourney } from "./journey-types";
import { getKnowledgeBundle } from "./knowledge";
import type { webSupabase } from "./supabase";
import { pickJourneyToFit, type JourneyToFit } from "./journey-fit";
import type { TrustMap } from "./trust";

/**
 * Reading and writing a traveler's own journey.
 *
 * Every call takes the REQUEST-SCOPED client, so RLS applies as the signed-in traveler and
 * this module cannot reach someone else's journey even by mistake. That is the control;
 * the checks here exist to turn a refusal into an answer, not to be the refusal.
 *
 * Health is recomputed on every read and every write rather than stored. A stored verdict
 * goes stale the moment anything else changes — a closure published in Ops, a day passing —
 * and a stale "Comfortable" is worse than no verdict at all.
 */

/*
 * Typed from the app's own client factory rather than importing @supabase/supabase-js
 * directly: the SDK is a dependency of @mandhira/db, not of this app, and reaching past
 * the package to its transitive dependency is how a version skew becomes a type error
 * nobody can explain.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

export type { StoredItem, StoredJourney } from "./journey-types";
export { toEngineJourney } from "./journey-types";

export type JourneyDetail = {
  journey: StoredJourney;
  items: StoredItem[];
  health: HealthReport;
  /** Experience and place names, so the timeline can label what it shows. */
  labels: Map<string, string>;
  /**
   * Trust by experience and place id, from the same bundle health was computed on, so the
   * journey screen can say when a critical field has gone stale (PRD-TRST-004).
   */
  trust: Record<string, TrustMap>;
};

const JOURNEY_COLUMNS =
  "id, title, start_date, end_date, timezone, day_start_time, day_end_time, pace, status, knowledge_checked_at";

const ITEM_COLUMNS =
  "id, day_index, sort_order, item_type, tier, experience_id, place_id, route_id, transport_connection_id, fixed_start_at, fixed_end_at, preferred_window_start, preferred_window_end, planned_start_at, planned_end_at, duration_likely_minutes, duration_max_minutes, travel_mode, buffer_minutes, note, status, actual_start_at, actual_end_at";

export type JourneyAtDestination = StoredJourney & { dayCount: number };

/** The traveler's journeys still ahead at one destination: where "Add to journey" can put something. */
export async function listJourneysAt(
  supabase: Client,
  destinationId: string,
): Promise<JourneyAtDestination[]> {
  const links = mustList(
    await supabase
      .from("journey_destinations")
      .select("journey_id")
      .eq("destination_id", destinationId),
    "journey_destinations",
  );
  const ids = [...new Set(links.map((link) => link.journey_id))];
  if (ids.length === 0) return [];

  const [journeysResult, itemsResult] = await Promise.all([
    supabase
      .from("journeys")
      .select(JOURNEY_COLUMNS)
      .in("id", ids)
      .is("deleted_at", null)
      .in("status", ["draft", "upcoming", "active"])
      .order("start_date", { ascending: true }),
    supabase
      .from("journey_items")
      .select("journey_id, day_index")
      .in("journey_id", ids)
      .is("deleted_at", null),
  ]);

  const rows = mustList(journeysResult, "journeys");
  const items = mustList(itemsResult, "journey_items");

  return rows.map((row) => {
    const journey = { ...toJourney(row), destinationId };
    const own = items.filter((item) => item.journey_id === journey.id);
    return { ...journey, dayCount: dayCountOf(journey, own) };
  });
}

export async function listJourneys(supabase: Client): Promise<StoredJourney[]> {
  const data = mustList(
    await supabase
      .from("journeys")
      .select(JOURNEY_COLUMNS)
      .is("deleted_at", null)
      .order("start_date", { ascending: true }),
    "journeys",
  );

  return data.map(toJourney);
}

/** One journey with its items and a freshly computed health report. */
export async function getJourney(
  supabase: Client,
  journeyId: string,
  locale: string,
): Promise<JourneyDetail | null> {
  const row = mustMaybe(
    await supabase
      .from("journeys")
      .select(JOURNEY_COLUMNS)
      .eq("id", journeyId)
      .is("deleted_at", null)
      .maybeSingle(),
    "journeys",
  );

  if (!row?.id) return null;

  const [destinationResult, itemsResult] = await Promise.all([
    supabase
      .from("journey_destinations")
      .select("destination_id")
      .eq("journey_id", journeyId)
      .order("sort_order")
      // A journey may hold several destinations; the first is the one planned against.
      .limit(1)
      .maybeSingle(),
    supabase
      .from("journey_items")
      .select(ITEM_COLUMNS)
      .eq("journey_id", journeyId)
      .is("deleted_at", null)
      .order("day_index")
      .order("sort_order"),
  ]);

  const destinationRow = mustMaybe(destinationResult, "journey_destinations");
  const itemRows = mustList(itemsResult, "journey_items");

  const journey = { ...toJourney(row), destinationId: destinationRow?.destination_id ?? null };
  const items = itemRows.map(toItem);

  const knowledge = journey.destinationId
    ? await getKnowledgeBundle(journey.destinationId, locale)
    : EMPTY_KNOWLEDGE;

  const health = computeHealth({
    journey: toEngineJourney(journey),
    items,
    knowledge,
  });

  return {
    journey,
    items,
    health,
    labels: await labelsFor(supabase, items, locale),
    // Built from the published views' TrustMap rows in getKnowledgeBundle.
    trust: (knowledge.trust ?? {}) as Record<string, TrustMap>,
  };
}

const EMPTY_KNOWLEDGE = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
  travel_estimates: [],
  trust: {},
};

function toJourney(row: Record<string, unknown>): StoredJourney {
  return {
    id: row["id"] as string,
    title: (row["title"] as string | null) ?? null,
    startDate: (row["start_date"] as string | null) ?? null,
    endDate: (row["end_date"] as string | null) ?? null,
    timezone: (row["timezone"] as string) ?? "Asia/Kolkata",
    dayStartTime: trimSeconds(row["day_start_time"] as string),
    dayEndTime: trimSeconds(row["day_end_time"] as string),
    pace: row["pace"] as StoredJourney["pace"],
    status: row["status"] as StoredJourney["status"],
    destinationId: null,
    knowledgeCheckedAt: (row["knowledge_checked_at"] as string | null) ?? null,
  };
}

function toItem(row: Record<string, unknown>): StoredItem {
  return {
    id: row["id"] as string,
    day_index: row["day_index"] as number,
    sort_order: row["sort_order"] as number,
    item_type: row["item_type"] as JourneyItem["item_type"],
    tier: row["tier"] as JourneyItem["tier"],
    experience_id: (row["experience_id"] as string | null) ?? null,
    place_id: (row["place_id"] as string | null) ?? null,
    route_id: (row["route_id"] as string | null) ?? null,
    transport_connection_id: (row["transport_connection_id"] as string | null) ?? null,
    fixed_start_at: (row["fixed_start_at"] as string | null) ?? null,
    fixed_end_at: (row["fixed_end_at"] as string | null) ?? null,
    preferred_window_start: trimSecondsOrNull(row["preferred_window_start"] as string | null),
    preferred_window_end: trimSecondsOrNull(row["preferred_window_end"] as string | null),
    planned_start_at: (row["planned_start_at"] as string | null) ?? null,
    planned_end_at: (row["planned_end_at"] as string | null) ?? null,
    duration_likely_minutes: (row["duration_likely_minutes"] as number | null) ?? null,
    duration_max_minutes: (row["duration_max_minutes"] as number | null) ?? null,
    travel_mode: (row["travel_mode"] as JourneyItem["travel_mode"]) ?? null,
    buffer_minutes: (row["buffer_minutes"] as number | null) ?? null,
    status: (row["status"] as StoredItem["status"]) ?? "planned",
    actual_start_at: (row["actual_start_at"] as string | null) ?? null,
    actual_end_at: (row["actual_end_at"] as string | null) ?? null,
  };
}

/**
 * Postgres `time` comes back as `06:00:00`; the engine parses `HH:MM` and throws otherwise.
 *
 * Trimmed at this boundary rather than loosening the engine's parser — that parser throwing
 * on a malformed time is a feature, and widening it to accept anything time-shaped would
 * give up a real guard for a formatting detail that belongs here.
 */
function trimSeconds(value: string | null | undefined): string {
  return (value ?? "06:00").slice(0, 5);
}

function trimSecondsOrNull(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

/** Names for whatever the items point at, resolved through the published views only. */
async function labelsFor(
  supabase: Client,
  items: JourneyItem[],
  locale: string,
): Promise<Map<string, string>> {
  const experienceIds = items.map((i) => i.experience_id).filter((id): id is string => !!id);
  const placeIds = items.map((i) => i.place_id).filter((id): id is string => !!id);
  const labels = new Map<string, string>();

  if (experienceIds.length > 0) {
    const data = mustList(
      await supabase
        .from("v_published_experiences")
        .select("id, name_i18n")
        .in("id", experienceIds),
      "v_published_experiences",
    );

    for (const row of data) {
      if (row.id) labels.set(row.id, pickLocale(row.name_i18n, locale));
    }
  }

  if (placeIds.length > 0) {
    const data = mustList(
      await supabase.from("v_published_places").select("id, name_i18n").in("id", placeIds),
      "v_published_places",
    );

    for (const row of data) {
      if (row.id) labels.set(row.id, pickLocale(row.name_i18n, locale));
    }
  }

  return labels;
}

function pickLocale(value: unknown, locale: string): string {
  const record = (value ?? {}) as Record<string, string>;
  return record[locale] ?? record["en"] ?? "";
}

/**
 * The journey search should rank against (PRD-DISC-006): the traveler's journey under way,
 * otherwise the soonest one ahead, with the destination it is planned against. Null for a
 * traveler with none, so search behaves exactly as it does for a guest.
 */
export async function journeyToFit(supabase: Client, today: string): Promise<JourneyToFit | null> {
  const journeys = (await listJourneys(supabase)).filter(
    (journey) =>
      journey.status === "active" || journey.status === "upcoming" || journey.status === "draft",
  );
  if (journeys.length === 0) return null;

  const links = mustList(
    await supabase
      .from("journey_destinations")
      .select("journey_id, destination_id, sort_order")
      .in(
        "journey_id",
        journeys.map((journey) => journey.id),
      )
      .order("sort_order"),
    "journey_destinations",
  );

  // The first destination is the one a journey is planned against, as in getJourney.
  const first = new Map<string, string>();
  for (const link of links) {
    if (!first.has(link.journey_id)) first.set(link.journey_id, link.destination_id);
  }

  return pickJourneyToFit(
    journeys.map((journey) => ({ ...journey, destinationId: first.get(journey.id) ?? null })),
    today,
  );
}
