import { CalendarDays, Check, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { calendarVaries, type CalendarDay } from "../lib/availability-calendar";

/**
 * The next fortnight of an experience (PRD §5 A06, "availability calendar").
 *
 * A server component, because every value on it is already known when the page renders —
 * the only interaction is folding it, which `<details>` does without a byte of script.
 *
 * Open by default when the days DIFFER, folded when they are all the same: a darshan held
 * every morning is fully described by the line above, and a seva held only on Saturdays
 * is exactly what this calendar is for.
 *
 * Each day says available or not in WORDS beside an icon (PRD §12.8: status is never
 * colour alone), and a day that is not available says why when the engine knows — "on
 * request" is a different answer from "closed", and a pilgrim acts on them differently.
 */
export async function AvailabilityCalendar({
  days,
  locale,
}: {
  days: CalendarDay[];
  locale: string;
}) {
  const t = await getTranslations("availabilityCalendar");
  if (days.length === 0) return null;

  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const time = (hhmm: string) => clock.format(new Date(`1970-01-01T${hhmm}:00Z`));

  return (
    <details
      open={calendarVaries(days)}
      className="group rounded-lg border border-border bg-bg-surface"
    >
      <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-body-sm font-medium [&::-webkit-details-marker]:hidden">
        <CalendarDays className="size-4 text-text-secondary" aria-hidden />
        {t("title")}
      </summary>

      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {days.map((day) => (
          <li
            key={day.date}
            className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-body-sm"
          >
            <time dateTime={day.date} className="font-medium tabular-nums">
              {dayLabel.format(new Date(`${day.date}T00:00:00Z`))}
            </time>

            {day.available ? (
              <span className="flex items-center gap-1.5 text-right text-text-primary">
                <Check className="size-4 shrink-0 text-status-comfortable" aria-hidden />
                {day.windows.length > 0
                  ? day.windows.map((w) => `${time(w.start)}–${time(w.end)}`).join(", ")
                  : t("available")}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-right text-text-secondary">
                <Minus className="size-4 shrink-0" aria-hidden />
                {t(`reason.${day.reason ?? "not_on_this_date"}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
