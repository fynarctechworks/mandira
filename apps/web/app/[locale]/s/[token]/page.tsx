import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { PrintButton } from "../../../../components/print-button";
import { SummarySheet } from "../../../../components/summary-sheet";
import { readShared } from "../../../../lib/share";
import { webSupabase } from "../../../../lib/supabase";

/**
 * A shared journey, opened by anyone with the link (PRD-PREP-004, TRD-SEC-004).
 *
 * Signed out, read-only, and served through `share_summary` — a SQL projection that cannot
 * return traveler profiles, item notes or the owner's identity. Nothing on this page is
 * assembled by hand from the journey tables, which is the point: see the 0019 header.
 *
 * There is no service-role client here. The function is granted to `anon`, so a public
 * page is served by the ordinary request-scoped client and the service key never comes
 * near the one route a stranger can reach.
 */
export const dynamic = "force-dynamic";

/** A shared link is a private URL. It must never reach an index. */
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedSummaryPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const supabase = await webSupabase();
  const summary = await readShared(supabase, token, locale);

  // Unknown, expired and revoked are all the same 404 — distinguishing them would confirm
  // that a journey existed behind this token, which is exactly what revoking undid.
  if (!summary) notFound();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <div className="no-print flex flex-col gap-2">
        {/*
          Said plainly because it is not obvious: this page reads the journey live, so it
          keeps up if the plan changes — and it stops working the moment the person who
          shared it stops sharing.
        */}
        <p className="text-caption text-text-secondary">
          Shared with you. You can read this plan but not change it, and it stays up to date if the
          plan changes.
        </p>
        <PrintButton />
      </div>

      <SummarySheet summary={summary} locale={locale} />
    </main>
  );
}
