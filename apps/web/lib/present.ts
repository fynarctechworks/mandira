import type { Accessibility, AvailabilityWindow } from "./knowledge";

/**
 * A translator over the `present` namespace. Plain on purpose: a server component passes
 * `getTranslations("present")` and a client component `useTranslations("present")`, and the
 * wording itself lives in the message catalogs (PRD-LANG-001).
 */
export type PlainTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Turning structured knowledge into the sentences PRD F2 asks for.
 *
 * Kept out of the components so each rule can be tested on its own, and so the wording
 * lives in one place rather than being re-derived slightly differently on every card.
 */

/**
 * "Daily 6:00–7:30 AM" (PRD F2), or the honest absence of that.
 *
 * Returns null rather than a placeholder when nothing is recorded. A card that says
 * "Availability unknown" invites a traveler to assume it is probably fine; a card that
 * says nothing sends them to the trust sheet, which is where the answer actually is.
 */
export function availabilityLine(
  windows: AvailabilityWindow[],
  locale: string,
  t: PlainTranslate,
): string | null {
  if (windows.length === 0) return null;

  const timed = windows.filter((w) => w.start && w.end);

  if (timed.length === 0) {
    // `always_during_opening` is a real answer, and a useful one.
    return windows.some((w) => w.kind === "always_during_opening") ? t("whenever_open") : null;
  }

  const parts = timed.map((w) => `${formatTime(w.start!, locale)}–${formatTime(w.end!, locale)}`);
  return t("daily", { times: parts.join(", ") });
}

/** "1 h 30 m" — minutes only below an hour, so short things do not read as "0 h 45 m". */
export function durationLabel(minutes: number | null, t: PlainTranslate): string | null {
  if (minutes == null || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return t("minutes", { minutes: rest });
  if (rest === 0) return t("hours", { hours });
  return t("hours_minutes", { hours, minutes: rest });
}

export type AccessibilityIcon = {
  key: "step_free" | "wheelchair" | "rest_seating" | "queue_assistance";
  /** `yes` and `partial` are shown; `no` is shown too. Only "unrecorded" is omitted. */
  value: "yes" | "no" | "partial";
};

/**
 * The accessibility icon set for a card (PRD F2, PRD-DISC-003).
 *
 * An unrecorded field produces NO icon rather than a negative one. Showing a crossed-out
 * wheelchair for a place nobody has checked tells a wheelchair user something false about
 * the world; showing nothing sends them to the detail, where "we don't know" is said
 * plainly (D-080).
 */
export function accessibilityIcons(accessibility: Accessibility | null): AccessibilityIcon[] {
  if (!accessibility) return [];

  const icons: AccessibilityIcon[] = [];

  if (accessibility.step_free) {
    icons.push({ key: "step_free", value: accessibility.step_free });
  }
  if (accessibility.wheelchair_access) {
    icons.push({ key: "wheelchair", value: accessibility.wheelchair_access });
  }
  if (accessibility.rest_seating === true) {
    icons.push({ key: "rest_seating", value: "yes" });
  }
  if (accessibility.queue_assistance === true) {
    icons.push({ key: "queue_assistance", value: "yes" });
  }

  return icons;
}

/** "Booking opens 60 days before" — PRD F2 requires the flag AND the lead time. */
export function bookingLine(
  required: boolean,
  opensDaysBefore: number | null,
  t: PlainTranslate,
): string | null {
  if (!required) return null;
  return opensDaysBefore ? t("booking_opens", { days: opensDaysBefore }) : t("booking_required");
}

/** A date a person reads, not an ISO string. */
export function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

/** "HH:MM" → the locale's own clock, so 18:30 reads as 6:30 pm where that is normal. */
function formatTime(value: string, locale: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (hours == null || minutes == null || Number.isNaN(hours)) return value;

  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

const WEEKDAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** The weekday in the reader's own language, from the locale's calendar data. */
function weekdayName(day: string, locale: string): string {
  const index = WEEKDAY_ORDER.indexOf(day);
  if (index < 0) return day;

  // 1 January 2024 was a Monday, so day `index` of that week is the weekday wanted.
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, 1 + index)),
  );
}

export type OpeningDay = { day: string; hours: string | null };

/**
 * A week of opening hours, in weekday order, with closed days named.
 *
 * Days with no entry are reported as closed rather than omitted. A list that silently
 * skips Tuesday reads as an oversight; "Tuesday — closed" is the answer someone travelled
 * to find out.
 */
export function openingWeek(
  schedule: { weekly?: Partial<Record<string, [string, string][]>> } | null,
  locale: string,
): OpeningDay[] {
  if (!schedule?.weekly) return [];

  return WEEKDAY_ORDER.map((day) => {
    const ranges = schedule.weekly?.[day] ?? [];
    return {
      day: weekdayName(day, locale),
      hours:
        ranges.length > 0
          ? ranges
              .map(([start, end]) => `${formatTime(start, locale)}–${formatTime(end, locale)}`)
              .join(", ")
          : null,
    };
  });
}

/**
 * "Usually 1 h 30 m — allow up to 3 h" (PRD F1's min/likely/max).
 *
 * The max is what a traveler actually plans around when a queue is unpredictable, so it is
 * said out loud rather than left in the data for the engine alone.
 */
export function durationRange(
  likely: number | null,
  max: number | null,
  t: PlainTranslate,
): string | null {
  const usual = durationLabel(likely, t);
  const worst = durationLabel(max, t);

  if (!usual) return worst ? t("allow_up_to", { max: worst }) : null;
  if (!worst || max === likely) return t("usually", { usual });
  return t("usually_allow", { usual, max: worst });
}

/**
 * "in 12 minutes", "25 minutes ago", "in 3 days" (PRD F8).
 *
 * Minutes within the hour, hours within two days, days beyond that. A journey three weeks
 * out counted down as "in 487 h 30 m", which is a number nobody reads as three weeks — and
 * Live is the screen a traveler checks while walking.
 */
export function relativeTime(
  instant: string,
  now: number,
  t: PlainTranslate,
  tPresent: PlainTranslate,
): string {
  const minutes = Math.round((Date.parse(instant) - now) / 60_000);
  const abs = Math.abs(minutes);

  if (abs < 1) return t("relative_now");

  const said =
    abs < 60
      ? t("minutes_count", { count: abs })
      : abs < 48 * 60
        ? abs % 60
          ? tPresent("hours_minutes", { hours: Math.floor(abs / 60), minutes: abs % 60 })
          : tPresent("hours", { hours: Math.floor(abs / 60) })
        : tPresent("days_count", { count: Math.round(abs / (60 * 24)) });

  return minutes > 0 ? t("relative_in", { duration: said }) : t("relative_ago", { duration: said });
}
