import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import {
  buildInitialJourney,
  type JourneyBrief,
  type TravelerProfile,
} from "@mandhira/journey-engine";

import { DayPlan } from "../../../../components/day-plan";
import { JourneyHealth } from "../../../../components/journey-health";
import { getDestinationPage, getKnowledgeBundle } from "../../../../lib/knowledge";

/**
 * The journey Mandhira proposes from a brief (PRD F4).
 *
 * The engine runs SERVER-SIDE here — the same pure `buildInitialJourney` that B-017 built
 * and that `apps/web/lib/engine` will run in a Web Worker once a journey is editable. One
 * implementation, so a plan built here and a plan recomputed on the phone cannot disagree
 * (D-005).
 *
 * NOTHING IS SAVED. `journeys` has no anon policy, and AUTHORIZATION_MODEL is explicit
 * that a guest gets device-local drafts only — which is Dexie, and Dexie is B-023.
 * Persisting a guest journey server-side keyed on a cookie would contradict that and make
 * anyone holding the cookie able to read it. So this renders the proposal and says plainly
 * that it is not kept, rather than implying a save that is not happening.
 */
export const dynamic = "force-dynamic";

type PreviewParams = {
  destination?: string;
  start?: string;
  days?: string;
  pace?: string;
  mobility?: string;
  must?: string | string[];
  like?: string | string[];
};

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<PreviewParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  if (!query.destination || !query.start) notFound();

  const page = await getDestinationPage(query.destination, locale);
  if (!page) notFound();

  const knowledge = await getKnowledgeBundle(page.destination.id, locale);

  const brief: JourneyBrief = {
    start_date: query.start,
    day_count: clampDays(query.days),
    timezone: "Asia/Kolkata",
    ...(isPace(query.pace) ? { pace: query.pace } : {}),
    must_do: asArray(query.must).map((id) => ({ experience_id: id })),
    would_like: asArray(query.like).map((id) => ({ experience_id: id })),
  };

  const travelers = travelersFrom(query.mobility);
  const { journey, items, health, warnings } = buildInitialJourney({
    brief,
    knowledge,
    travelers,
  });

  const nameOf = new Map(page.experiences.map((e) => [e.id, e.name.text]));
  const dayIndexes = [...new Set(items.map((i) => i.day_index))].sort((a, b) => a - b);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}/plan?destination=${query.destination}`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Change the brief
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-text-secondary">{page.destination.name.text}</p>
        <h1 className="text-display">Your journey</h1>
      </header>

      <JourneyHealth report={health} />

      {items.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          You didn&apos;t choose anything to do, so there is nothing to work out yet. Go back and
          pick at least one thing.
        </p>
      ) : (
        dayIndexes.map((dayIndex) => (
          <DayPlan
            key={dayIndex}
            dayIndex={dayIndex}
            journey={journey}
            items={items.filter((i) => i.day_index === dayIndex)}
            health={health.days.find((d) => d.dayIndex === dayIndex)}
            nameOf={nameOf}
            locale={locale}
          />
        ))
      )}

      {/*
       * Warnings are the engine saying what it could not do — a missing duration, an
       * experience that runs on no day of this journey. Shown rather than swallowed: the
       * engine never silently drops an item, so the reason has to reach somebody.
       */}
      {warnings.length > 0 ? (
        <section aria-labelledby="warnings" className="flex flex-col gap-2">
          <h2 id="warnings" className="text-h3">
            Worth knowing about this plan
          </h2>
          <ul className="flex flex-col gap-2">
            {warnings.map((warning, index) => (
              <li
                key={`${warning.code}-${warning.itemId}-${index}`}
                className="rounded-lg border border-border bg-bg-surface p-3 text-body-sm"
              >
                {warning.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="rounded-lg border border-border bg-bg-surface p-4 text-body-sm text-text-secondary">
        This plan isn&apos;t saved anywhere yet. Keeping a journey — and changing it as you go —
        arrives with the journey builder.
      </p>
    </main>
  );
}

function clampDays(value: string | undefined): number {
  const days = Number(value);
  return Number.isFinite(days) && days >= 1 && days <= 14 ? Math.floor(days) : 3;
}

function isPace(value: string | undefined): value is "relaxed" | "balanced" | "full" {
  return value === "relaxed" || value === "balanced" || value === "full";
}

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * The group, as the form described it.
 *
 * One traveler stands for the whole party, carrying the most constrained mobility. The
 * engine takes the strictest limit in the group anyway (PRD-PLAN-005), so asking for a
 * full roster here would collect more about people than the answer needs — and this data
 * never reaches `traveler_profiles` or anything Ops can read (PRD-PRIV-002).
 */
function travelersFrom(mobility: string | undefined): TravelerProfile[] {
  const known: TravelerProfile["mobility"][] = [
    "full",
    "limited_walking",
    "wheelchair",
    "needs_rest_frequently",
  ];

  const chosen = known.find((m) => m === mobility) ?? "full";
  return [{ id: "party", mobility: chosen, age_band: "adult" }];
}
