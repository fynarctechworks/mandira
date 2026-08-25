import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { PrepareList } from "../../../../../components/prepare-list";
import { getPrepareChecklist } from "../../../../../lib/prepare";
import { formatDate } from "../../../../../lib/present";
import { webSupabase } from "../../../../../lib/supabase";

/**
 * The Prepare tab (PRD F7, PRD-PREP-001).
 *
 * Everything on this screen is derived from what the journey already contains. There is no
 * generic advice — no "carry a power bank" — because a checklist that pads itself teaches
 * travelers to skim, and then the one task that mattered gets skimmed too.
 *
 * PRD F7 makes the tab available on demand rather than only inside 30 days: a traveler
 * planning three months out is exactly the person who needs the booking deadlines.
 */
export const dynamic = "force-dynamic";

export default async function PreparePage({
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
    redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/journeys/${id}/prepare`)}`);
  }

  // RLS means another traveler's journey is simply not visible, so this is a 404 rather
  // than a 403 — confirming it exists would itself be a leak.
  const checklist = await getPrepareChecklist(supabase, id, locale);
  if (!checklist) notFound();

  // Dates are formatted server-side, where the locale lives, and handed down as labels —
  // the client component never does locale work of its own.
  const dateLabels: Record<string, string> = {};
  for (const group of checklist.groups) {
    for (const task of group.tasks) {
      for (const key of [task.dueDate, task.trust?.verified_at?.slice(0, 10)]) {
        if (key && !dateLabels[key]) dateLabels[key] = formatDate(key, locale) ?? key;
      }
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}/journeys/${id}`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {checklist.journeyTitle}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-display">Prepare</h1>
        {checklist.totalCount > 0 ? (
          <p className="text-body-sm text-text-secondary">
            {checklist.doneCount} of {checklist.totalCount} done
          </p>
        ) : null}
      </header>

      {checklist.totalCount === 0 ? (
        /*
         * An empty checklist is a real answer, not a failure: nothing in this journey
         * needs booking, and nothing has a dress code recorded. Said plainly rather than
         * dressed up as an error.
         */
        <p className="text-body text-text-secondary">
          There's nothing to prepare for this journey yet. Once you add something that needs booking
          or has a dress code, it'll show up here.
        </p>
      ) : (
        <PrepareList journeyId={id} groups={checklist.groups} dateLabels={dateLabels} />
      )}

      <Link
        href={`/${locale}/journeys/${id}/summary`}
        className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-body-sm font-medium"
      >
        <Printer className="size-4" aria-hidden />
        Journey summary
      </Link>
    </main>
  );
}
