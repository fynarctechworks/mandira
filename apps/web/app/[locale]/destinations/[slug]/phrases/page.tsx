import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PhrasePackView } from "../../../../../components/phrase-pack-view";
import { getPhrasePage } from "../../../../../lib/phrase-pack";

/**
 * Phrase assistance for one destination (PRD F12, PRD-LANG-004, screen A17).
 *
 * Reached from the destination page, every place page, and — as a sheet, so it works with no
 * signal — from the Live screen's NOW card. Guest-readable like the rest of discovery.
 *
 * Server-rendered through `v_published_phrases` only, so a draft phrase cannot reach this page
 * (D-029). A failed read is thrown to the route's boundary rather than shown as "no phrases",
 * which would be a false answer.
 */
export const dynamic = "force-dynamic";

export default async function PhrasesPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const page = await getPhrasePage(slug, locale);
  if (!page) notFound();
  const t = await getTranslations("phrases");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}/destinations/${slug}`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back", { destination: page.destination.name.text })}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-display">{t("title")}</h1>
        <p className="text-body text-text-secondary">
          {t("intro", { destination: page.destination.name.text })}
        </p>
      </header>

      <PhrasePackView destinationId={page.destination.id} locale={locale} phrases={page.phrases} />
    </main>
  );
}
