import { ArrowLeft, ListChecks, Play, Share2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { HealthPill, TierChip } from "@mandhira/ui";
import { dateForDay, fromInstant } from "@mandhira/journey-engine";

import { ItemActions } from "../../../../components/item-actions";
import { causeText, JourneyHealth, trustText } from "../../../../components/journey-health";
import { getJourney, toEngineJourney } from "../../../../lib/journeys";
import { durationLabel } from "../../../../lib/present";
import { webSupabase } from "../../../../lib/supabase";

/**
 * The journey builder (PRD F4's Day view, PLAN-01/02/03/05).
 *
 * A vertical timeline per day. Each item carries its tier, its time, how long it takes and
 * its buffer, and opens the actions that PRD-PLAN-003 requires.
 *
 * There is deliberately no "fill my day" anywhere on this screen (PRD-PLAN-008). The
 * builder starts from what the traveler said and stays there — an empty afternoon is a
 * choice, not a gap to be filled.
 */
/** `priority_tier_enum` → the PRD §12.1 keyword the chip displays. */
const TIER_CHIP = {
  fixed: "FIXED",
  protected: "PROTECTED",
  important: "IMPORTANT",
  optional: "OPTIONAL",
} as const;

export const dynamic = "force-dynamic";

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await webSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/journeys/${id}`)}`);
  }

  // RLS means another traveler's journey simply is not visible, so this is a 404 rather
  // than a 403 — confirming it exists would itself be a leak.
  const detail = await getJourney(supabase, id, locale);
  if (!detail) notFound();

  const { journey, items, health, labels } = detail;
  const engineJourney = toEngineJourney(journey);
  const dayCount = Math.max(1, new Set(items.map((i) => i.day_index)).size);
  const dayIndexes = [...new Set(items.map((i) => i.day_index))].sort((a, b) => a - b);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}/journeys`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Your journeys
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-display">{journey.title ?? "Your journey"}</h1>
      </header>

      <JourneyHealth report={health} />

      {/*
       * PRD-LIVE-001's read-time half: Live is reachable whenever the journey has days,
       * without anything being written. "Start today" inside it is the explicit tap that
       * moves the journey to `active`.
       *
       * Given the primary action because on the morning it matters, this is the only
       * thing on this screen the traveler wants.
       */}
      <Link
        href={`/${locale}/journeys/${journey.id}/live`}
        className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-button bg-brand-primary px-4 font-medium text-text-on-primary"
      >
        <Play className="size-4" aria-hidden />
        Today
      </Link>

      <div className="flex gap-2">
        {/*
          PRD F7 makes Prepare available on demand rather than only inside 30 days — the
          traveler planning three months out is exactly the one who needs the booking
          deadlines, and a tab that appears later appears too late.
        */}
        <Link
          href={`/${locale}/journeys/${journey.id}/prepare`}
          className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-body-sm font-medium"
        >
          <ListChecks className="size-4" aria-hidden />
          Prepare
        </Link>
        <Link
          href={`/${locale}/journeys/${journey.id}/summary`}
          className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-body-sm font-medium"
        >
          <Share2 className="size-4" aria-hidden />
          Summary
        </Link>
      </div>

      {dayIndexes.map((dayIndex) => {
        const day = health.days.find((d) => d.dayIndex === dayIndex);
        const date = dateForDay(engineJourney.start_date, dayIndex);
        const causes = [...new Set((day?.causes ?? []).map(causeText).filter(Boolean))];
        const trust = [...new Set((day?.trustExposure ?? []).map(trustText).filter(Boolean))];

        return (
          <section
            key={dayIndex}
            aria-labelledby={`day-${dayIndex}`}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id={`day-${dayIndex}`} className="text-h2">
                {new Intl.DateTimeFormat(locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date(`${date}T00:00:00Z`))}
              </h2>
              {day ? <HealthPill state={day.state} /> : null}
            </div>

            {causes.length > 0 || trust.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-lg border border-border bg-bg-surface p-3">
                {causes.map((text) => (
                  <li key={text} className="text-body-sm">
                    {text}
                  </li>
                ))}
                {trust.map((text) => (
                  <li key={text} className="text-body-sm text-text-secondary">
                    {text}
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="flex flex-col gap-3">
              {items
                .filter((i) => i.day_index === dayIndex)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item) => {
                  const label = item.experience_id
                    ? (labels.get(item.experience_id) ?? "Something you added")
                    : "Free time";
                  const duration = durationLabel(item.duration_likely_minutes ?? null);

                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-h3">{label}</h3>
                          <p className="text-caption text-text-secondary">
                            {clock(item.planned_start_at, date, engineJourney.timezone, locale)}
                            {duration ? ` · ${duration}` : ""}
                            {/* PRD-PLAN-005: the buffer is visible, not just editable. */}
                            {item.buffer_minutes
                              ? ` · ${item.buffer_minutes} min to get there`
                              : ""}
                          </p>
                        </div>
                        {/*
                         * The engine speaks the database's lowercase enum; the design
                         * system speaks PRD §12.1's displayed keywords. Mapped at the
                         * boundary rather than bending either to the other.
                         */}
                        <TierChip tier={TIER_CHIP[item.tier]} readOnly />
                      </div>

                      <ItemActions
                        journeyId={journey.id}
                        itemId={item.id}
                        tier={item.tier}
                        bufferMinutes={item.buffer_minutes ?? 15}
                        dayIndex={item.day_index}
                        dayCount={dayCount}
                      />
                    </li>
                  );
                })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

/** Local wall time, or nothing at all for an item the engine could not place. */
function clock(
  instant: string | null | undefined,
  date: string,
  timeZone: string,
  locale: string,
): string {
  if (!instant) return "Not scheduled";

  const minutes = fromInstant(instant, date, timeZone);
  const inDay = ((minutes % 1440) + 1440) % 1440;

  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(inDay / 60), inDay % 60)));
}
