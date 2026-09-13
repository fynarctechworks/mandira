import { ArrowRight, ListChecks } from "lucide-react";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { listJourneys } from "../../../lib/journeys";
import { getPrepareChecklist } from "../../../lib/prepare";
import { formatDate } from "../../../lib/present";
import { webSupabase } from "../../../lib/supabase";

/**
 * Prepare, across journeys (PRD F7, the bottom navigation's Prepare tab).
 *
 * One card per journey still ahead, with how much of its checklist is ready. The checklist
 * itself lives with its journey; this is the way in. A guest is told why there is nothing here
 * and offered sign-in, rather than shown an empty list that implies they have nothing to do.
 */
export const dynamic = "force-dynamic";

const FINISHED = new Set(["completed", "archived"]);

export default async function PrepareHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, supabase] = await Promise.all([getTranslations("prepareHub"), webSupabase()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-display">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("signed_out")}</p>
        <Link
          href={`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/prepare`)}`}
          className="focus-ring flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-4 text-body font-medium text-text-on-primary"
        >
          {t("sign_in")}
        </Link>
      </main>
    );
  }

  const upcoming = (await listJourneys(supabase)).filter((journey) => {
    if (FINISHED.has(journey.status)) return false;
    const lastDay = journey.endDate ?? journey.startDate;
    if (!lastDay) return true;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: journey.timezone }).format(
      new Date(),
    );
    return lastDay >= today;
  });

  const checklists = await Promise.all(
    upcoming.map((journey) => getPrepareChecklist(supabase, journey.id, locale)),
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("intro")}</p>
      </header>

      {upcoming.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{t("empty")}</p>
          <Link
            href={`/${locale}/plan`}
            className="focus-ring flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-4 text-body font-medium text-text-on-primary"
          >
            {t("plan")}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {upcoming.map((journey, index) => {
            const checklist = checklists[index];
            const total = checklist?.totalCount ?? 0;
            const done = checklist?.doneCount ?? 0;

            return (
              <li key={journey.id}>
                <Link
                  href={`/${locale}/journeys/${journey.id}/prepare`}
                  className="focus-ring flex min-h-11 flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-h3">{journey.title ?? t("untitled")}</span>
                    <ArrowRight className="size-5 shrink-0 text-text-secondary" aria-hidden />
                  </span>
                  <span className="text-caption text-text-secondary">
                    {formatDate(journey.startDate, locale) ?? t("no_date")}
                  </span>
                  <span className="flex items-center gap-2 text-body-sm">
                    <ListChecks className="size-4 shrink-0" aria-hidden />
                    {total > 0 ? t("progress", { done, total }) : t("nothing")}
                  </span>
                  {total > 0 ? (
                    <span
                      aria-hidden
                      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    >
                      <span
                        className="block h-full bg-primary"
                        style={{ width: `${Math.round((done / total) * 100)}%` }}
                      />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
