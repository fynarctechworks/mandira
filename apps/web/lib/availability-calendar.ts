import {
  dateForDay,
  resolveAvailability,
  type AvailabilityResult,
  type AvailabilityRule,
  type OpeningSchedule,
} from "@mandhira/journey-engine";

/**
 * The next fortnight of an experience, day by day (PRD §5 A06: "availability calendar").
 *
 * The experience page used to show one line — "Daily 6:00–7:30 AM" — which is enough for
 * something that happens every day and useless for anything that does not. A seva held on
 * Saturdays, a darshan closed on eclipse days, a ritual that only runs in Kartika: the
 * question a pilgrim is asking is "is it on while I am there?", and one line cannot answer
 * it for a particular date. Fourteen rows can.
 *
 * PURE, and built on the engine's own `resolveAvailability`, so the calendar can never
 * disagree with what the planner decides. A day the calendar shows as open is a day the
 * engine will schedule it on, because they are the same function.
 *
 * Fourteen days, not thirty: far enough to cover a pilgrimage being planned now, short
 * enough to read on a phone without scrolling past everything else on the page.
 */
export const CALENDAR_DAYS = 14;

export type CalendarDay = {
  date: string;
  available: boolean;
  windows: { start: string; end: string }[];
  /** Why not, when it is not — the engine's reason, for the sentence the screen shows. */
  reason: AvailabilityResult["reason"] | null;
};

export function availabilityCalendar(input: {
  rules: AvailabilityRule[];
  openingSchedule: OpeningSchedule | null;
  /** The first day shown — today in the destination's time zone. */
  from: string;
  days?: number;
}): CalendarDay[] {
  const count = input.days ?? CALENDAR_DAYS;

  return Array.from({ length: count }, (_, offset) => {
    const date = dateForDay(input.from, offset);
    const result = resolveAvailability({
      rules: input.rules,
      date,
      openingSchedule: input.openingSchedule,
    });

    return {
      date,
      available: result.available,
      windows: result.windows.map((window) => ({ start: window.start, end: window.end })),
      reason: result.available ? null : result.reason,
    };
  });
}

/**
 * Whether the days differ, which decides whether the calendar starts OPEN.
 *
 * It is always on the page (PRD §5 A06 lists it), but an experience available at the same
 * times every day is fully described by the one line above it, and fourteen identical
 * rows shown by default would push everything else down. So a uniform calendar starts
 * folded, one tap away, and one whose days differ starts open — which is exactly when a
 * pilgrim needs it.
 */
export function calendarVaries(days: CalendarDay[]): boolean {
  const signature = (day: CalendarDay) =>
    day.available ? day.windows.map((w) => `${w.start}-${w.end}`).join(",") : "closed";
  return new Set(days.map(signature)).size > 1;
}
