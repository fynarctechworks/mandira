/** Product signals (O22): the day switch and the chart's series. Aggregates only, by design. */

export const DAY_OPTIONS = [7, 30, 90] as const;
export type Days = (typeof DAY_OPTIONS)[number];

export type ProductSignals = {
  since: string;
  events: { event: string; total: number; offline: number }[];
  daily: { day: string; event: string; count: number }[];
  locales: Record<string, number>;
};

/** PRD F20's signals derived from journeys, from `product_outcomes()` (0048). Counts only. */
export type ProductOutcomes = {
  since: string;
  journeys: { created: number; with_protected: number; with_protected_and_fixed: number };
  health_at_departure: Partial<Record<(typeof DEPARTURE_STATES)[number][0], number>>;
  change_cards: {
    shown: number;
    accepted: number;
    kept_as_is: number;
    accepted_within_2_min: number;
  };
  live: {
    journey_days: number;
    journey_days_with_live: number;
    opened: number;
    opened_offline: number;
  };
  leave_by: { sent: number; acted: number };
  offline: { events: number; renders: number };
  reports: { total: number; valid: number; journey_days: number };
};

export const DEPARTURE_STATES = [
  ["comfortable", "Comfortable"],
  ["tight", "Tight"],
  ["at_risk", "At risk"],
  ["broken", "Broken"],
] as const;

/** A count per 1,000 journey-days, to one decimal; null before anyone has travelled. */
export function per1000(count: number, journeyDays: number): number | null {
  if (journeyDays <= 0) return null;
  return Math.round((count / journeyDays) * 10_000) / 10;
}

export function parseDays(value: string | undefined): Days {
  const n = Number(value);
  return (DAY_OPTIONS as readonly number[]).includes(n) ? (n as Days) : 30;
}

/** Today's date in India, where `product_signals` buckets its days. */
export function istDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export type Series = { key: string; label: string };

/**
 * One row per day for the whole window, zeros included, with the busiest events as their
 * own series and the rest summed as "Everything else". Series keys are positional so an
 * event name never has to be a valid CSS variable name.
 */
export function dailySeries(
  daily: ProductSignals["daily"],
  events: ProductSignals["events"],
  days: number,
  now: Date,
  top = 4,
): { series: Series[]; data: Record<string, string | number>[] } {
  const leaders = [...events]
    .sort((a, b) => b.total - a.total)
    .slice(0, top)
    .map((e) => e.event);
  const series: Series[] = leaders.map((event, i) => ({ key: `s${i}`, label: event }));
  const hasOther = events.some((e) => !leaders.includes(e.event));
  if (hasOther) series.push({ key: "other", label: "Everything else" });

  const end = new Date(`${istDay(now)}T00:00:00Z`);
  const rows = new Map<string, Record<string, string | number>>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - i);
    const day = date.toISOString().slice(0, 10);
    rows.set(day, Object.fromEntries([["day", day], ...series.map((s) => [s.key, 0])]));
  }

  for (const point of daily) {
    const row = rows.get(point.day.slice(0, 10));
    if (!row) continue;
    const index = leaders.indexOf(point.event);
    const key = index >= 0 ? `s${index}` : "other";
    row[key] = Number(row[key] ?? 0) + point.count;
  }

  return { series, data: [...rows.values()] };
}
