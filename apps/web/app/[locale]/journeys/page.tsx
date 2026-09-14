import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DraftRecovery } from "../../../components/draft-recovery";
import { listJourneys } from "../../../lib/journeys";
import { webSupabase } from "../../../lib/supabase";

/**
 * The traveler's journeys.
 *
 * Signed in only, because a journey is stored against an account. A guest is sent to
 * sign-in with `next` pointing back here, rather than shown an empty list that implies
 * they have none.
 */
export const dynamic = "force-dynamic";

const STATUS_ORDER = ["active", "upcoming", "draft", "completed", "archived"] as const;

export default async function JourneysPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await webSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/journeys`)}`);

  const [journeys, t, tJourney, tHub] = await Promise.all([
    listJourneys(supabase),
    getTranslations("journeysList"),
    getTranslations("addToJourney"),
    getTranslations("prepareHub"),
  ]);

  /*
   * Grouped by where each journey stands, the one under way first. A flat list of cards
   * that all read "Your journey · a date" gave no way to tell a finished pilgrimage from
   * next month's (design review; PRD F13 journeys list).
   */
  const groups = STATUS_ORDER.map((status) => ({
    status,
    journeys: journeys.filter((journey) => journey.status === status),
  })).filter((group) => group.journeys.length > 0);

  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const datesOf = (journey: (typeof journeys)[number]) => {
    if (!journey.startDate) return tHub("no_date");
    const first = new Date(`${journey.startDate}T00:00:00Z`);
    if (!journey.endDate || journey.endDate === journey.startDate) return day.format(first);
    return day.formatRange(first, new Date(`${journey.endDate}T00:00:00Z`));
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">{t("title")}</h1>
      </header>

      {/*
        Renders nothing unless this device is holding a draft from before the traveler had
        an account — the other half of guest-first (carried from B-019).
      */}
      <DraftRecovery locale={locale} />

      {journeys.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{t("empty")}</p>
          <Link
            href={`/${locale}/plan`}
            className="focus-ring flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-4 text-body font-medium text-text-on-primary"
          >
            {tHub("plan")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section
              key={group.status}
              aria-labelledby={`group-${group.status}`}
              className="flex flex-col gap-3"
            >
              <h2
                id={`group-${group.status}`}
                className="text-body-sm font-medium text-text-secondary"
              >
                {t(`groups.${group.status}`)}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.journeys.map((journey) => (
                  <li key={journey.id}>
                    <Link
                      href={`/${locale}/journeys/${journey.id}`}
                      className="focus-ring flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-bg-surface p-4"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-h3">{journey.title ?? tJourney("untitled")}</span>
                        <span className="text-caption text-text-secondary">{datesOf(journey)}</span>
                      </span>
                      <ArrowRight className="size-5 shrink-0 text-text-secondary" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
