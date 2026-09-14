import { dateForDay, resolveAvailability, type AvailabilityRule } from "@mandhira/journey-engine";

export type NextOccurrence = {
  /** The local date, YYYY-MM-DD. */
  date: string;
  /** The first window's start that day, HH:MM, when the rule gives one. */
  start: string | null;
};

/**
 * When an experience next happens, from `fromDate` on (PRD F2 "Rituals & events (with next
 * occurrence)").
 *
 * The same resolver the engine plans with, asked one date at a time, so the destination
 * page can never promise a date the planner would refuse. Null when nothing happens within
 * the horizon — a festival whose next dates nobody has published yet says so rather than
 * guessing from last year.
 */
export function nextOccurrence(
  rules: AvailabilityRule[],
  fromDate: string,
  horizonDays = 366,
): NextOccurrence | null {
  if (rules.length === 0) return null;

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = dateForDay(fromDate, offset);
    const { windows } = resolveAvailability({ rules, date });
    if (windows.length === 0) continue;

    const first = windows[0] as { start?: string | null };
    return { date, start: first.start ?? null };
  }

  return null;
}

/** Today's date where the destination is. Pilgrimage destinations are all in IST for now. */
export function todayIn(timeZone = "Asia/Kolkata", now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}
