import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { PrintButton } from "../../../../../components/print-button";
import { ShareControls } from "../../../../../components/share-controls";
import { SummarySheet } from "../../../../../components/summary-sheet";
import { formatDate } from "../../../../../lib/present";
import { listShares, readOwnSummary } from "../../../../../lib/share";
import { webSupabase } from "../../../../../lib/supabase";

/**
 * The Journey Summary the owner sees (PRD-PREP-004).
 *
 * Read through `my_journey_summary`, the same SQL projection a share link opens — so what
 * is previewed here is exactly what gets sent, down to the column list. The controls are
 * marked `no-print` and disappear on paper.
 */
export const dynamic = "force-dynamic";

export default async function SummaryPage({
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
    redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/journeys/${id}/summary`)}`);
  }

  const [summary, shares] = await Promise.all([
    readOwnSummary(supabase, id, locale),
    listShares(supabase, id),
  ]);

  if (!summary) notFound();

  const live = shares[0] ?? null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <div className="no-print flex flex-col gap-4">
        <Link
          href={`/${locale}/journeys/${id}`}
          className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to your journey
        </Link>

        <PrintButton />

        <ShareControls
          journeyId={id}
          locale={locale}
          initialToken={live?.token ?? null}
          expiresLabel={live?.expiresAt ? formatDate(live.expiresAt, locale) : null}
        />
      </div>

      <SummarySheet summary={summary} locale={locale} />
    </main>
  );
}
