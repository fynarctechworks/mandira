import type { KnowledgeBundle } from "@mandhira/journey-engine";

import { getJourney, type StoredItem, type StoredJourney } from "../journeys";
import { getKnowledgeBundle } from "../knowledge";
import type { webSupabase } from "../supabase";

/**
 * Assembling everything one journey needs offline (PRD-OFFL-001).
 *
 * The `bundle` here is the engine's `KnowledgeBundle` unchanged, because TRD-ARCH-002 says
 * the snapshot and the engine's input are the same bytes — feed this to `getNowNextLater`
 * in a browser with no network and it must produce what the server produced.
 *
 * Everything else in the payload is the SUPERSET a screen needs: names, coordinates,
 * guidance, facilities. Those are presentation, not scheduling input, which is exactly why
 * they sit beside the bundle rather than inside it (see the DOC-02 note in
 * docs/plans/OFFL-01.md — TRD §5.1's field list conflates the two).
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

export type SnapshotEntity = {
  entity_table: string;
  id: string;
  payload: Record<string, unknown>;
};

export type JourneySnapshot = {
  journey: StoredJourney;
  items: StoredItem[];
  /** The engine's input, byte-for-byte (TRD-ARCH-002). */
  bundle: KnowledgeBundle;
  /** Names, pins, guidance — what a screen renders and the engine ignores. */
  entities: SnapshotEntity[];
  prepareTasks: { id: string; payload: Record<string, unknown> }[];
  /** When this was assembled, which is the "as of" a traveler is shown. */
  syncedAt: string;
};

export async function buildSnapshot(
  supabase: Client,
  journeyId: string,
  locale: string,
): Promise<JourneySnapshot | null> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  const { journey, items } = detail;

  const bundle = journey.destinationId
    ? await getKnowledgeBundle(journey.destinationId, locale)
    : EMPTY_BUNDLE;

  const [entities, prepareTasks] = await Promise.all([
    entitiesFor(supabase, journey, items, locale),
    prepareTasksFor(supabase, journeyId),
  ]);

  return {
    journey,
    items,
    bundle,
    entities,
    prepareTasks,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * The presentational half: every place and experience the journey touches, their guidance,
 * and the destination's facilities.
 *
 * Facilities are included even though no item points at one (PRD F11's "essential facility
 * locations"). The moment someone needs to know where the nearest drinking water or
 * cloakroom is, is not a moment they will have signal — and it is not something they
 * planned, so nothing in the itinerary references it.
 */
async function entitiesFor(
  supabase: Client,
  journey: StoredJourney,
  items: StoredItem[],
  locale: string,
): Promise<SnapshotEntity[]> {
  const placeIds = items.map((i) => i.place_id).filter((id): id is string => !!id);
  const experienceIds = items.map((i) => i.experience_id).filter((id): id is string => !!id);

  const [places, experiences, facilities] = await Promise.all([
    placeIds.length
      ? supabase.from("v_published_places").select(PLACE_COLUMNS).in("id", placeIds)
      : empty(),
    experienceIds.length
      ? supabase.from("v_published_experiences").select(EXPERIENCE_COLUMNS).in("id", experienceIds)
      : empty(),
    journey.destinationId
      ? supabase
          .from("v_published_places")
          .select(PLACE_COLUMNS)
          .eq("destination_id", journey.destinationId)
          .eq("place_type", "facility")
          .limit(50)
      : empty(),
  ]);

  const entities: SnapshotEntity[] = [];
  const seen = new Set<string>();

  const add = (table: string, rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const id = row["id"] as string | undefined;
      if (!id || seen.has(`${table}:${id}`)) continue;
      seen.add(`${table}:${id}`);
      entities.push({ entity_table: table, id, payload: row });
    }
  };

  add("places", [...(places.data ?? []), ...(facilities.data ?? [])] as Record<string, unknown>[]);
  add("experiences", (experiences.data ?? []) as Record<string, unknown>[]);

  // Guidance for everything gathered above, in one query rather than one per entity.
  const guidance = await guidanceFor(
    supabase,
    entities.filter((e) => e.entity_table === "places").map((e) => e.id),
    entities.filter((e) => e.entity_table === "experiences").map((e) => e.id),
    locale,
  );

  return [...entities, ...guidance];
}

async function guidanceFor(
  supabase: Client,
  placeIds: string[],
  experienceIds: string[],
  locale: string,
): Promise<SnapshotEntity[]> {
  void locale;
  if (placeIds.length === 0 && experienceIds.length === 0) return [];

  const { data } = await supabase
    .from("v_published_guidance_blocks")
    .select("id, guidance_type, body_i18n, applies_to_table, applies_to_id, sort_order")
    .in("applies_to_id", [...placeIds, ...experienceIds])
    .order("sort_order");

  /*
   * `body_i18n` is stored whole rather than resolved to the current language. A traveler
   * who switches to Telugu on a train with no signal should get Telugu, not the English
   * that happened to be selected when the snapshot was written.
   */
  return (data ?? []).map((row) => ({
    entity_table: "guidance_blocks",
    id: row.id as string,
    payload: row as unknown as Record<string, unknown>,
  }));
}

async function prepareTasksFor(
  supabase: Client,
  journeyId: string,
): Promise<{ id: string; payload: Record<string, unknown> }[]> {
  const { data } = await supabase
    .from("prepare_tasks")
    .select("id, engine_key, group_name, is_done, due_at, sort_order, trust_ref, source_item_id")
    .eq("journey_id", journeyId);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    payload: row as unknown as Record<string, unknown>,
  }));
}

const PLACE_COLUMNS =
  "id, destination_id, slug, name_i18n, place_type, facility_subtype, address, summary_i18n, opening_schedule, closure_rules_i18n, entry_requirements_i18n, dress_code_i18n, hours_note_i18n, visit_duration_min_minutes, visit_duration_likely_minutes, visit_duration_max_minutes, trust, accessibility, latitude, longitude";

const EXPERIENCE_COLUMNS =
  "id, destination_id, place_id, slug, name_i18n, experience_type, significance_i18n, description_i18n, duration_min_minutes, duration_likely_minutes, duration_max_minutes, advance_booking_required, advance_booking_how_i18n, advance_booking_opens_days_before, eligibility_i18n, cost_note_i18n, queue_expectation_i18n, preparation_i18n, is_outdoor, trust, accessibility";

/** A resolved empty result, so the callers above can stay one shape. */
function empty() {
  return Promise.resolve({ data: [] as Record<string, unknown>[] });
}

const EMPTY_BUNDLE: KnowledgeBundle = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
  travel_estimates: [],
  trust: {},
};
