import type { Accessibility, AvailabilityWindow } from "./knowledge";

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
export function availabilityLine(windows: AvailabilityWindow[], locale: string): string | null {
  if (windows.length === 0) return null;

  const timed = windows.filter((w) => w.start && w.end);

  if (timed.length === 0) {
    // `always_during_opening` is a real answer, and a useful one.
    return windows.some((w) => w.kind === "always_during_opening")
      ? "Whenever the place is open"
      : null;
  }

  const parts = timed.map((w) => `${formatTime(w.start!, locale)}–${formatTime(w.end!, locale)}`);
  return `Daily ${parts.join(", ")}`;
}

/** "1 h 30 m" — minutes only below an hour, so short things do not read as "0 h 45 m". */
export function durationLabel(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} m`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} m`;
}

export type AccessibilityIcon = {
  key: "step_free" | "wheelchair" | "rest_seating" | "queue_assistance";
  /** `yes` and `partial` are shown; `no` is shown too. Only "unrecorded" is omitted. */
  value: "yes" | "no" | "partial";
  label: string;
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
    icons.push({ key: "step_free", value: accessibility.step_free, label: "Step-free" });
  }
  if (accessibility.wheelchair_access) {
    icons.push({
      key: "wheelchair",
      value: accessibility.wheelchair_access,
      label: "Wheelchair access",
    });
  }
  if (accessibility.rest_seating === true) {
    icons.push({ key: "rest_seating", value: "yes", label: "Somewhere to sit" });
  }
  if (accessibility.queue_assistance === true) {
    icons.push({ key: "queue_assistance", value: "yes", label: "Queue assistance" });
  }

  return icons;
}

/** "Booking opens 60 days before" — PRD F2 requires the flag AND the lead time. */
export function bookingLine(required: boolean, opensDaysBefore: number | null): string | null {
  if (!required) return null;
  return opensDaysBefore
    ? `Advance booking required — opens ${opensDaysBefore} days before`
    : "Advance booking required";
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
