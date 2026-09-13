import { mustList } from "./data-error";
import { assembleLiveView, type LivePlace, type LiveView } from "./live-view";
import { getJourney } from "./journeys";
import { getKnowledgeBundle } from "./knowledge";
import type { webSupabase } from "./supabase";

export type { LiveItemView, LivePlace, LiveView } from "./live-view";

/**
 * The Live Journey screen's data, read from Postgres (PRD F8, LIVE-01..04).
 *
 * This module only FETCHES. Everything about what the screen says lives in
 * `assembleLiveView`, which is pure — because the same view has to be built in a browser
 * from IndexedDB when there is no network (TRD-ARCH-002), and two assemblers would drift.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

/**
 * Build the Live view for one journey at one instant.
 *
 * `nowAt` is passed in rather than read here, for the same reason the engine takes it: a
 * function that reads the clock cannot be tested against 5:59am on a day the darshan
 * closes at 6.
 */
export async function getLiveView(
  supabase: Client,
  journeyId: string,
  locale: string,
  nowAt: string,
): Promise<LiveView | null> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  const { journey, items, labels } = detail;

  const bundle = journey.destinationId
    ? await getKnowledgeBundle(journey.destinationId, locale)
    : EMPTY_BUNDLE;

  return assembleLiveView({
    journey,
    items,
    bundle,
    labels,
    places: await placesFor(supabase, items, locale),
    nowAt,
  });
}

/** Names and pins for whatever the day points at, through the published views only. */
async function placesFor(
  supabase: Client,
  items: { place_id?: string | null }[],
  locale: string,
): Promise<Map<string, LivePlace>> {
  const ids = [...new Set(items.map((i) => i.place_id).filter((id): id is string => !!id))];
  const places = new Map<string, LivePlace>();
  if (ids.length === 0) return places;

  const data = mustList(
    await supabase
      .from("v_published_places")
      .select("id, name_i18n, latitude, longitude")
      .in("id", ids),
    "v_published_places",
  );

  for (const row of data) {
    if (!row.id) continue;
    const names = (row.name_i18n ?? {}) as Record<string, string>;
    places.set(row.id, {
      name: names[locale] ?? names["en"] ?? "",
      latitude: (row.latitude as number | null) ?? null,
      longitude: (row.longitude as number | null) ?? null,
    });
  }

  return places;
}

const EMPTY_BUNDLE = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
  travel_estimates: [],
  trust: {},
};
