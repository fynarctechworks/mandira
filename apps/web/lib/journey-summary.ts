import { getI18n } from "@mandhira/i18n";

import type { StoredJourney } from "./journey-types";
import type { webSupabase } from "./supabase";

type Client = Awaited<ReturnType<typeof webSupabase>>;

/**
 * What a journey CARD says about a journey: which pilgrimage it is, when, and how it
 * stands — on the Journeys list and on the Prepare hub alike.
 *
 * The design review found every card reading "Your journey · a date", which gave a
 * traveler nothing to tell one pilgrimage from another. D-211 fixed the Journeys list and
 * left the Prepare hub as it was, because the fix lived inside one page. It lives here now,
 * so the two screens cannot drift apart a second time.
 */
export type JourneySummary = {
  /** "Tirumala" or "Tirumala · Srisailam" for a circuit; null when none is published. */
  destination: string | null;
  /** "12 – 14 Oct 2026", in the reader's language. */
  dates: string | null;
  /** The engine's latest verdict, as stored (D-230). Null until it has been computed once. */
  health: StoredJourney["healthState"];
};

/**
 * Destination names for many journeys in two reads, not one per card.
 *
 * Two reads rather than an embed: a traveler reads destinations through the published
 * view, never the table, so an embedded join comes back empty (0008).
 */
export async function destinationNames(
  supabase: Client,
  journeyIds: string[],
  locale: string,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (journeyIds.length === 0) return names;

  const { data: links } = await supabase
    .from("journey_destinations")
    .select("journey_id, destination_id, sort_order")
    .in("journey_id", journeyIds)
    .order("sort_order");

  const ids = [...new Set((links ?? []).map((link) => link.destination_id))];
  const { data: destinations } = ids.length
    ? await supabase.from("v_published_destinations").select("id, name_i18n, slug").in("id", ids)
    : { data: [] };

  const nameOf = new Map(
    (destinations ?? []).map((destination) => [
      destination.id as string,
      getI18n(destination.name_i18n as Record<string, string>, locale).text ||
        (destination.slug as string),
    ]),
  );

  for (const link of links ?? []) {
    const name = nameOf.get(link.destination_id);
    if (!name) continue;
    const existing = names.get(link.journey_id);
    names.set(link.journey_id, existing ? `${existing} · ${name}` : name);
  }
  return names;
}

/** A journey's dates as one range, in the reader's language. Null when it has none yet. */
export function journeyDates(
  journey: Pick<StoredJourney, "startDate" | "endDate">,
  locale: string,
): string | null {
  if (!journey.startDate) return null;
  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const first = new Date(`${journey.startDate}T00:00:00Z`);
  if (!journey.endDate || journey.endDate === journey.startDate) return day.format(first);
  return day.formatRange(first, new Date(`${journey.endDate}T00:00:00Z`));
}

/** Everything a card needs, for a whole list at once. */
export async function summariseJourneys(
  supabase: Client,
  journeys: StoredJourney[],
  locale: string,
): Promise<Map<string, JourneySummary>> {
  const names = await destinationNames(
    supabase,
    journeys.map((journey) => journey.id),
    locale,
  );
  return new Map(
    journeys.map((journey) => [
      journey.id,
      {
        destination: names.get(journey.id) ?? null,
        dates: journeyDates(journey, locale),
        health: journey.healthState,
      },
    ]),
  );
}
