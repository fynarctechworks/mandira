import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LiveJourney } from "../../../../../components/live-journey";
import { StartToday } from "../../../../../components/start-today";
import { LiveConditions } from "../../../../../components/live-conditions";
import { getLiveConditions } from "../../../../../lib/live-conditions";
import { getLiveView } from "../../../../../lib/live";
import { readPreferences } from "../../../../../lib/notifications";
import { webSupabase } from "../../../../../lib/supabase";

/**
 * Live Journey (PRD F8, LIVE-01..04).
 *
 * The clock is read HERE and nowhere below. `getNowNextLater` takes `nowAt` as a parameter
 * because the engine has no clock (D-005) — which is what lets the same projection run on
 * a server, in a worker, and on a phone in airplane mode and agree. This page is the one
 * place that decides what "now" means, and it decides it once per render.
 *
 * The signed-in check lives in middleware (D-102), so a signed-out visitor never reaches
 * this render at all.
 */
export const dynamic = "force-dynamic";

export default async function LivePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await webSupabase();
  const view = await getLiveView(supabase, id, locale, new Date().toISOString());
  const tJourney = await getTranslations("addToJourney");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const leaveByReminders = user
    ? ((await readPreferences(supabase, user.id)).leave_by ?? false)
    : false;

  /*
   * Live conditions (PRD F10). Read server-side and rendered above the plan, because a
   * thunderstorm forecast during an outdoor evening aarti changes what a traveler does
   * about the day — and PRD F10 requires it to be visibly distinct from verified
   * knowledge, which is what the "Live · provider · as of" label does.
   *
   * Deliberately NOT part of the offline snapshot: a forecast cached yesterday is not a
   * live value, and PRD F10 forbids showing one in a live slot. Offline, this section is
   * simply absent.
   */
  const conditions = view?.destinationId
    ? await getLiveConditions(supabase, view.destinationId, locale)
    : [];

  /*
   * A null view here is NOT a 404 any more.
   *
   * This page has to render with no network, and offline the server read returns nothing
   * for a journey that plainly exists — the traveler is holding a snapshot of it. So the
   * client is given null and reads IndexedDB instead; a genuinely missing journey shows
   * the "not saved for offline yet" state, which is the honest answer either way.
   *
   * RLS still decides what the server read can see, and a stranger's journey was never in
   * this device's IndexedDB to begin with.
   */

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      {/* The screen's name for assistive technology; the visible title is the back link. */}
      <h1 className="sr-only">{view?.journeyTitle ?? tJourney("untitled")}</h1>
      {/*
       * Live is a screen you can leave, not a mode that captures the app. A traveler who
       * wants to see the whole plan should not have to work out how to escape.
       */}
      <Link
        href={`/${locale}/journeys/${id}`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {view?.journeyTitle ?? tJourney("untitled")}
      </Link>

      {/*
       * PRD-LIVE-001's explicit half. Automatic activation is a read-time decision — this
       * screen works whether or not the journey has been marked `active` — so this asks
       * only when the traveler has not said so themselves.
       */}
      {view && !view.isActive && view.onJourneyDates ? <StartToday journeyId={id} /> : null}

      <LiveConditions conditions={conditions} />

      <LiveJourney view={view} locale={locale} leaveByReminders={leaveByReminders} />
    </main>
  );
}
