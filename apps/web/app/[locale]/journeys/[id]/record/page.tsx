import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TierChip } from "@mandhira/ui";
import { dateForDay } from "@mandhira/journey-engine";

import { CompleteJourney } from "../../../../../components/complete-journey";
import { PlanSimilar } from "../../../../../components/plan-similar";
import { Reflection } from "../../../../../components/reflection";
import { getJourneyRecord } from "../../../../../lib/record";
import { webSupabase } from "../../../../../lib/supabase";

/**
 * The Journey Record (PRD F16, PRD-CMPL-001).
 *
 * What happened, built from the Done taps the traveler made — never inferred from a time
 * having passed. And deliberately NOT a score: PRD F16 asks for a plain statement about
 * protected experiences, and this product does not tell somebody they completed 71% of
 * their pilgrimage. A traveler who missed the evening aarti because their mother needed to
 * sit down has not underperformed.
 */
const TIER_CHIP = {
  fixed: "FIXED",
  protected: "PROTECTED",
  important: "IMPORTANT",
  optional: "OPTIONAL",
} as const;

export const dynamic = "force-dynamic";

export default async function RecordPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await webSupabase();
  const record = await getJourneyRecord(supabase, id, locale);
  if (!record) notFound();

  const t = await getTranslations("record");
  const start = record.startDate ?? new Date().toISOString().slice(0, 10);
  const clock = (at: string) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(at));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}/journeys/${id}`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {record.title}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-display">{record.isOver ? t("complete_title") : t("going_title")}</h1>

        {/*
          PRD F16's "plain statement, no score". A sentence, never a ratio and never a
          percentage — the same reasoning that keeps a number off Journey Health (PRD F5).
        */}
        {record.protectedPlanned > 0 ? (
          <p className="text-body text-text-secondary">
            {record.protectedCompleted === record.protectedPlanned
              ? t("all_done")
              : record.protectedCompleted === 0
                ? t("none_done")
                : t("some_done", {
                    done: record.protectedCompleted,
                    planned: record.protectedPlanned,
                  })}
          </p>
        ) : null}
      </header>

      {record.days.map((day) => (
        <section
          key={day.dayIndex}
          aria-labelledby={`record-day-${day.dayIndex}`}
          className="flex flex-col gap-2"
        >
          <h2 id={`record-day-${day.dayIndex}`} className="text-h2">
            {new Intl.DateTimeFormat(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date(`${dateForDay(start, day.dayIndex)}T00:00:00Z`))}
          </h2>

          <ul className="flex flex-col rounded-lg border border-border bg-bg-surface">
            {day.items.map((item) => (
              <li
                key={item.itemId}
                className="flex flex-col gap-1 border-b border-border-subtle px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    {item.completed ? (
                      <Check className="size-4 shrink-0 text-status-comfortable" aria-hidden />
                    ) : (
                      /*
                       * No cross, and nothing red. An item that did not happen is a fact,
                       * not a failure — marking it like one would be the score PRD F16
                       * forbids, wearing a different hat.
                       */
                      <span className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className={item.completed ? "text-body" : "text-body text-text-tertiary"}>
                      {item.label}
                    </span>
                  </span>
                  <TierChip tier={TIER_CHIP[item.tier]} readOnly />
                </div>

                <p className="pl-6 text-caption text-text-secondary">
                  {item.completed
                    ? item.actualEndAt
                      ? t("done_at", { time: clock(item.actualEndAt) })
                      : t("done")
                    : t("not_done")}
                </p>

                {/* The traveler's own note, kept beside what it was about. */}
                {item.note ? <p className="pl-6 text-body-sm">{item.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Reflection journeyId={id} initial={record.reflection} locale={locale} />

      {/*
        Offered once the last day is behind them, and only until they take it. A journey
        still under way is not asked whether it is over.
      */}
      {record.isOver && !record.isComplete ? <CompleteJourney journeyId={id} /> : null}

      <PlanSimilar journeyId={id} locale={locale} />
    </main>
  );
}
