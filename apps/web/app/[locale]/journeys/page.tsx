import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

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

export default async function JourneysPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await webSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/journeys`)}`);

  const journeys = await listJourneys(supabase);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Your journeys</h1>
      </header>

      {/*
        Renders nothing unless this device is holding a draft from before the traveler had
        an account — the other half of guest-first (carried from B-019).
      */}
      <DraftRecovery locale={locale} />

      {journeys.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">You haven&apos;t saved a journey yet.</p>
          <Link
            href={`/${locale}/plan`}
            className="focus-ring flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-4 text-body font-medium text-brand-primary-on"
          >
            Plan a journey
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {journeys.map((journey) => (
            <li key={journey.id}>
              <Link
                href={`/${locale}/journeys/${journey.id}`}
                className="focus-ring flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-bg-surface p-4"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-h3">{journey.title ?? "Your journey"}</span>
                  {journey.startDate ? (
                    <span className="text-caption text-text-secondary">
                      {new Intl.DateTimeFormat(locale, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }).format(new Date(`${journey.startDate}T00:00:00Z`))}
                    </span>
                  ) : null}
                </span>
                <ArrowRight className="size-5 shrink-0 text-text-secondary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
