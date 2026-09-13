import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageLinks } from "../../../../../components/page-links";
import { PlaceCard } from "../../../../../components/place-card";
import { getDestinationPlacesPage } from "../../../../../lib/knowledge";

/** Every place at a destination, twenty at a time (PRD F2 "See all"). */
export const dynamic = "force-dynamic";

export default async function DestinationPlacesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const { page } = await searchParams;
  const section = await getDestinationPlacesPage(slug, Number(page ?? 1), locale);
  if (!section || section.page > section.pageCount) notFound();

  const t = await getTranslations("discovery");
  const basePath = `/${locale}/destinations/${slug}/places`;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}/destinations/${slug}`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back", { name: section.destination.name.text })}
      </Link>

      <h1 className="text-display">{t("places_title")}</h1>

      {section.cards.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {section.cards.map((place) => (
            <PlaceCard key={place.id} place={place} locale={locale} destinationSlug={slug} />
          ))}
        </div>
      )}

      <PageLinks basePath={basePath} page={section.page} pageCount={section.pageCount} />
    </main>
  );
}
