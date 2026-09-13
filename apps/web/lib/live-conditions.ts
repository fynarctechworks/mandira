import { mustList } from "./data-error";
import type { webSupabase } from "./supabase";

/**
 * Live conditions for a destination (PRD F10, PRD-DYN-001/003).
 *
 * PRD F10 draws three visibly distinct categories, and this is the third: **live**, from an
 * external feed, labelled "Live · provider · as of time". The rules around it are unusually
 * strict, and both are structural here rather than conventions:
 *
 *   - Never a value without a provider and a timestamp. `LiveCondition` has no shape in
 *     which those are absent.
 *   - Never illustrative data in a live slot. There is no default reading; a destination
 *     with no enabled feed produces nothing, and the screen shows nothing.
 *
 * PRD-DYN-003's outage case is the interesting one. When the newest reading is
 * `unavailable`, the traveler is not shown a blank and is not shown the old value as
 * though it were current — they are told what was last known and when, and the badge drops
 * to "check locally". A blank invites the assumption that conditions are fine.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

export type WeatherHour = {
  at: string;
  temperatureC: number;
  precipitationChance: number;
  condition: string;
};

export type LiveCondition = {
  feedKind: string;
  /** Always present — PRD F10 forbids a live value without it. */
  provider: string;
  /** Always present, for the same reason. */
  readAt: string;
  /** True when the newest attempt failed, or the reading is older than its own interval. */
  degraded: boolean;
  /** The sentence PRD-DYN-001/003 specify, already assembled. */
  label: string;
  hours: WeatherHour[];
  /** Hours a plan would care about (PRD-DYN-004). */
  disruptive: WeatherHour[];
};

export async function getLiveConditions(
  supabase: Client,
  destinationId: string,
  locale: string,
): Promise<LiveCondition[]> {
  const data = mustList(
    await supabase
      .from("v_published_live_conditions")
      .select("feed_kind, provider, read_at, status, payload, is_stale")
      .eq("destination_id", destinationId),
    "v_published_live_conditions",
  );

  return data.map((row) => {
    const payload = (row.payload ?? {}) as {
      hours?: WeatherHour[];
      disruptive?: WeatherHour[];
    };

    const degraded = row.status !== "ok" || row.is_stale === true;

    return {
      feedKind: row.feed_kind as string,
      provider: row.provider as string,
      readAt: row.read_at as string,
      degraded,
      label: labelFor(row.provider as string, row.read_at as string, degraded, locale),
      /*
       * An unavailable reading carries no hours of its own — its payload is the reason it
       * failed. The last GOOD reading is what the label refers to, and showing its hours
       * beside an "unavailable" label would be showing stale data as current. So a
       * degraded feed shows its label and no values.
       */
      hours: degraded ? [] : (payload.hours ?? []),
      disruptive: degraded ? [] : (payload.disruptive ?? []),
    };
  });
}

/**
 * PRD-DYN-001 and PRD-DYN-003's exact sentences.
 *
 * Assembled here rather than in a component so both the Live screen and any future
 * surface say the same thing — a live value labelled two different ways in two places is
 * a trust problem, not a copy problem.
 */
function labelFor(provider: string, readAt: string, degraded: boolean, locale: string): string {
  const at = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(readAt));

  return degraded
    ? `Live update unavailable — showing last known (as of ${at}).`
    : `Live · ${provider} · as of ${at}`;
}

/**
 * Conditions overlapping an item's window.
 *
 * Used to decide whether anything is worth saying about a particular item at all. An
 * outdoor evening aarti during a thunderstorm is worth a line; the same forecast is
 * irrelevant to a darshan inside a temple, and saying it anyway is how a traveler learns
 * to skim.
 */
export function disruptiveDuring(
  conditions: LiveCondition[],
  startAt: string | null,
  endAt: string | null,
): WeatherHour[] {
  if (!startAt) return [];

  const from = Date.parse(startAt);
  const to = endAt ? Date.parse(endAt) : from + 3_600_000;

  return conditions
    .flatMap((condition) => condition.disruptive)
    .filter((hour) => {
      const at = Date.parse(hour.at);
      return at >= from - 3_600_000 && at <= to;
    });
}
