import { ArrowLeft, BookOpen, ListChecks, Play, Share2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HealthPill, TierChip } from "@mandhira/ui";
import { dateForDay, fromInstant } from "@mandhira/journey-engine";

import { DayHealthSheet } from "../../../../components/day-health-sheet";
import { ItemActions } from "../../../../components/item-actions";
import { JourneyDetailsSheet } from "../../../../components/journey-details-sheet";
import { JourneySync } from "../../../../components/journey-sync";
import { KnowledgeWatch } from "../../../../components/knowledge-watch";
import { ReorderButtons } from "../../../../components/reorder-buttons";
import { StaleNote } from "../../../../components/stale-note";
import { causeText, JourneyHealth, trustText } from "../../../../components/journey-health";
import { journeyVersion } from "../../../../lib/journey-version";
import { getJourney, toEngineJourney } from "../../../../lib/journeys";
import { durationLabel } from "../../../../lib/present";
import { staleNoteFor, staleNoteKey } from "../../../../lib/stale-note";
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

  const [t, tPresent, tTier] = await Promise.all([
    getTranslations(),
    getTranslations("present"),
    getTranslations("itemActions.tiers"),
  ]);
  const { journey, items, health, labels, trust } = detail;
  // What another device may change underneath this page (PRD-ACCT-005).
  const version = await journeyVersion(supabase, journey.id);

  /*
   * PRD-TRST-004: in an active journey, an item whose critical information has gone stale
   * says so once, on its card. Before the journey starts, Prepare's knowledge check covers it.
   */
  const staleNotes = new Map(
    journey.status === "active"
      ? items.flatMap((item) => {
          const note = staleNoteFor(item, trust);
          return note ? [[item.id, note] as const] : [];
        })
      : [],
  );
  const engineJourney = toEngineJourney(journey);
  const dayCount = Math.max(1, new Set(items.map((i) => i.day_index)).size);
  const dayIndexes = [...new Set(items.map((i) => i.day_index))].sort((a, b) => a - b);
  const itemNames = Object.fromEntries(
    items.map((item) => [
      item.id,
      item.experience_id
        ? (labels.get(item.experience_id) ?? t("common.something_you_added"))
        : t("common.free_time"),
    ]),
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}/journeys`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("journeysList.title")}
      </Link>

      <header className="flex flex-col gap-3">
        <h1 className="text-display">{journey.title ?? t("addToJourney.untitled")}</h1>
        <JourneyDetailsSheet
          journeyId={journey.id}
          initial={{
            title: journey.title,
            startDate: journey.startDate,
            endDate: journey.endDate,
            dayStartTime: journey.dayStartTime,
            dayEndTime: journey.dayEndTime,
            pace: journey.pace,
          }}
        />
      </header>

      <JourneyHealth report={health} />

      {/*
        PRD-OPS-WF-007's traveler half. If something in this plan was corrected in Ops since
        the last look, this raises a Change Card — offered, never applied. It renders nothing
        when there is nothing to say, which is almost always.
      */}
      <KnowledgeWatch journeyId={journey.id} />
      {version ? <JourneySync journeyId={journey.id} version={version} /> : null}

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
        {t("journeyPage.today")}
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
          {t("prepareHub.title")}
        </Link>
        <Link
          href={`/${locale}/journeys/${journey.id}/summary`}
          className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-body-sm font-medium"
        >
          <Share2 className="size-4" aria-hidden />
          {t("journeyPage.summary")}
        </Link>

        {/*
          PRD F16. Reachable throughout rather than only once the last day has passed — a
          traveler mid-journey wants to see what they have done, and a screen that appears
          only at the end appears too late to be trusted.
        */}
        <Link
          href={`/${locale}/journeys/${journey.id}/record`}
          className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-body-sm font-medium"
        >
          <BookOpen className="size-4" aria-hidden />
          {t("journeyPage.record")}
        </Link>
      </div>

      {dayIndexes.map((dayIndex) => {
        const day = health.days.find((d) => d.dayIndex === dayIndex);
        const date = dateForDay(engineJourney.start_date, dayIndex);
        const dayLabel = new Intl.DateTimeFormat(locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date(`${date}T00:00:00Z`));
        const causes = [
          ...new Set((day?.causes ?? []).map((c) => causeText(t, c)).filter(Boolean)),
        ];
        const trust = [
          ...new Set((day?.trustExposure ?? []).map((c) => trustText(t, c)).filter(Boolean)),
        ];

        return (
          <section
            key={dayIndex}
            aria-labelledby={`day-${dayIndex}`}
            className="flex flex-col gap-3"
          >
            {/* Wraps rather than squeezing: a long weekday in Telugu at 390px put the
                heading on three lines beside the health pill. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 id={`day-${dayIndex}`} className="min-w-0 text-h2">
                {dayLabel}
              </h2>
              {day ? (
                <div className="flex items-center gap-1">
                  <HealthPill state={day.state} />
                  <DayHealthSheet
                    journeyId={journey.id}
                    dayIndex={dayIndex}
                    dayLabel={dayLabel}
                    day={day}
                    itemNames={itemNames}
                    timeZone={engineJourney.timezone}
                  />
                </div>
              ) : null}
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
                .map((item, index, dayItems) => {
                  const label = item.experience_id
                    ? (labels.get(item.experience_id) ?? t("common.something_you_added"))
                    : t("common.free_time");
                  const duration = durationLabel(item.duration_likely_minutes ?? null, tPresent);

                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-h3">{label}</h3>
                          <p className="text-caption text-text-secondary">
                            {clock(
                              item.planned_start_at,
                              date,
                              engineJourney.timezone,
                              locale,
                              t("common.not_scheduled"),
                            )}
                            {duration ? ` · ${duration}` : ""}
                            {/* PRD-PLAN-005: the buffer is visible, not just editable. */}
                            {item.buffer_minutes
                              ? ` · ${t("journeyPage.buffer", { minutes: item.buffer_minutes })}`
                              : ""}
                          </p>
                        </div>
                        {/*
                         * The engine speaks the database's lowercase enum; the design
                         * system speaks PRD §12.1's displayed keywords. Mapped at the
                         * boundary rather than bending either to the other.
                         */}
                        <TierChip
                          tier={TIER_CHIP[item.tier]}
                          label={tTier(`${item.tier}.label`)}
                          readOnly
                        />
                      </div>

                      {staleNotes.has(item.id) ? (
                        <StaleNote
                          storageKey={staleNoteKey(item.id, staleNotes.get(item.id)!)}
                          text={t("journeyPage.stale_note", {
                            months: staleNotes.get(item.id)!.months,
                          })}
                          dismissLabel={t("journeyPage.stale_dismiss")}
                        />
                      ) : null}

                      {dayItems.length > 1 ? (
                        <ReorderButtons
                          journeyId={journey.id}
                          dayIndex={item.day_index}
                          orderedIds={dayItems.map((entry) => entry.id)}
                          index={index}
                          name={label}
                        />
                      ) : null}

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
  /** What an item the engine could not place says instead of a time. */
  unscheduled: string,
): string {
  if (!instant) return unscheduled;

  const minutes = fromInstant(instant, date, timeZone);
  const inDay = ((minutes % 1440) + 1440) % 1440;

  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(inDay / 60), inDay % 60)));
}
