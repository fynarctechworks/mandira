import { toMinutes, weekdayOf } from "./time";
import type { AvailabilityRule, IsoDate, OpeningSchedule, TimeOfDay, TimeWindow } from "./types";

export type AvailabilityResult = {
  available: boolean;
  windows: TimeWindow[];
  /** Why, in terms the UI can turn into a sentence. */
  reason:
    "available" | "no_rules" | "not_on_this_date" | "outside_windows" | "on_request" | "closed";
};

/**
 * When an experience can actually happen on a given date (TRD §5.1 `resolveAvailability`).
 *
 * Rules stack by `priority`: a festival-week rule overrides the everyday one. The HIGHEST
 * priority rule that applies to the date wins outright rather than being merged with
 * lower ones — merging would produce a union of windows that no single source ever
 * claimed, which is exactly the kind of invented fact the trust model exists to prevent.
 *
 * `on_request` is reported as unavailable-for-scheduling with its own reason: the engine
 * must not place it automatically, but the UI needs to say "arranged in advance" rather
 * than "closed".
 */
export function resolveAvailability(input: {
  rules: AvailabilityRule[];
  date: IsoDate;
  time?: TimeOfDay;
  /** Opening hours of the host place, for `always_during_opening`. */
  openingSchedule?: OpeningSchedule | null;
}): AvailabilityResult {
  const { rules, date, time, openingSchedule } = input;

  const applicable = rules
    .filter((rule) => isRuleValidOn(rule, date))
    .filter((rule) => appliesToDate(rule, date))
    .sort((a, b) => b.priority - a.priority);

  if (rules.length === 0) return { available: false, windows: [], reason: "no_rules" };
  if (applicable.length === 0) {
    return { available: false, windows: [], reason: "not_on_this_date" };
  }

  const winner = applicable[0]!;

  if (winner.kind === "on_request") {
    return { available: false, windows: [], reason: "on_request" };
  }

  const windows = windowsFor(winner, date, openingSchedule);
  if (windows.length === 0) {
    return {
      available: false,
      windows: [],
      reason: winner.kind === "always_during_opening" ? "closed" : "outside_windows",
    };
  }

  if (time === undefined) return { available: true, windows, reason: "available" };

  const at = toMinutes(time);
  const inside = windows.some((w) => at >= toMinutes(w.start) && at < toMinutes(w.end));

  return inside
    ? { available: true, windows, reason: "available" }
    : { available: false, windows, reason: "outside_windows" };
}

/** A rule outside its validity dates does not apply at all, whatever its kind. */
function isRuleValidOn(rule: AvailabilityRule, date: IsoDate): boolean {
  if (rule.valid_from && date < rule.valid_from) return false;
  if (rule.valid_to && date > rule.valid_to) return false;
  return true;
}

function appliesToDate(rule: AvailabilityRule, date: IsoDate): boolean {
  switch (rule.kind) {
    case "date_range":
      return (
        rule.date_start != null &&
        rule.date_end != null &&
        date >= rule.date_start &&
        date <= rule.date_end
      );
    case "calendar_dates":
      return (rule.calendar_dates ?? []).includes(date);
    case "weekly_pattern":
      return (rule.weekly_pattern?.[weekdayOf(date)] ?? []).length > 0;
    case "daily_fixed_times":
      return (rule.daily_times ?? []).length > 0;
    case "always_during_opening":
    case "on_request":
      return true;
  }
}

function windowsFor(
  rule: AvailabilityRule,
  date: IsoDate,
  openingSchedule?: OpeningSchedule | null,
): TimeWindow[] {
  switch (rule.kind) {
    case "daily_fixed_times":
    case "date_range":
    case "calendar_dates":
      // A date-scoped rule may still name its times; if it does not, it covers the day.
      return normalise(rule.daily_times ?? [{ start: "00:00", end: "23:59" }]);
    case "weekly_pattern":
      return normalise(rule.weekly_pattern?.[weekdayOf(date)] ?? []);
    case "always_during_opening":
      return openingWindows(openingSchedule, date);
    case "on_request":
      return [];
  }
}

/** Opening hours for a date, honouring exceptions over the weekly pattern. */
function openingWindows(schedule: OpeningSchedule | null | undefined, date: IsoDate): TimeWindow[] {
  if (!schedule) return [];

  const exception = schedule.exceptions?.find((e) => e.date === date);
  if (exception) {
    if (exception.closed) return [];
    return normalise((exception.hours ?? []).map(([start, end]) => ({ start, end })));
  }

  const weekly = schedule.weekly?.[weekdayOf(date)];
  // A day absent from the pattern is "not recorded"; a day present but empty is "closed".
  // Neither can be scheduled against, but only one of them is a data gap.
  if (!weekly) return [];
  return normalise(weekly.map(([start, end]) => ({ start, end })));
}

/** Drops inverted or empty windows and returns them in order. */
function normalise(windows: TimeWindow[]): TimeWindow[] {
  return windows
    .filter((w) => {
      try {
        return toMinutes(w.start) < toMinutes(w.end);
      } catch {
        // A malformed window is dropped rather than throwing: one bad row should not make
        // an entire journey unschedulable.
        return false;
      }
    })
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}
