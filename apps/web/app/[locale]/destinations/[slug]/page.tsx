import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SourcesFooter } from "@mandhira/ui";

import { ExperienceCard } from "../../../../components/experience-card";
import { PlaceCard } from "../../../../components/place-card";
import { getDestinationPage } from "../../../../lib/knowledge";
import { formatDate } from "../../../../lib/present";

/**
 * The destination page (PRD F2).
 *
 * Sections run in the order PRD F2 sets out, and that order is the product: what people
 * come here for, before the list of places, before the practical detail. A directory sorted
 * alphabetically would contain the same facts and answer none of the questions someone
 * planning a pilgrimage actually has.
 *
 * Server-rendered. Every read goes through the published views, so nothing unpublished or
 * ungated can reach this component even by mistake (D-029).
 */
export const dynamic = "force-dynamic";

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const page = await getDestinationPage(slug, locale);
  if (!page) notFound();
  const t = await getTranslations("discovery");

  const { destination, experiences, places, guidance, advisories } = page;
  const oldestVerified = formatDate(page.oldestVerifiedAt, locale);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-2">
        {destination.region ? (
          <p className="text-body-sm font-medium text-text-secondary">{destination.region}</p>
        ) : null}
        <h1 className="text-display">{destination.name.text}</h1>
        {destination.overview.text ? (
          <p className="text-body text-text-secondary">{destination.overview.text}</p>
        ) : null}
      </header>

      {/*
       * Advisories sit above everything. An advisory a traveler scrolls past is an
       * advisory that did not happen — and this is the section most likely to be the
       * reason their day does not work.
       */}
      {advisories.length > 0 ? (
        <section aria-label="Advisories" className="flex flex-col gap-3">
          {advisories.map((advisory) => (
            <div
              key={advisory.id}
              className={`flex gap-3 rounded-lg border p-4 ${
                advisory.severity === "important"
                  ? "border-status-broken bg-bg-surface"
                  : "border-border bg-bg-surface"
              }`}
            >
              {advisory.severity === "info" ? (
                <Info className="size-5 shrink-0 text-text-secondary" aria-hidden />
              ) : (
                <AlertTriangle
                  className={`size-5 shrink-0 ${
                    advisory.severity === "important" ? "text-status-broken" : "text-status-tight"
                  }`}
                  aria-hidden
                />
              )}
              <div className="flex flex-col gap-1">
                <h2 className="text-body font-medium">{advisory.title.text}</h2>
                <p className="text-body-sm text-text-secondary">{advisory.body.text}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <Section
        title="What people come here for"
        empty="Nothing here has been published yet."
        count={experiences.length}
        seeAll={
          page.experienceTotal > experiences.length
            ? {
                href: `/${locale}/destinations/${slug}/experiences`,
                label: t("see_all", { count: page.experienceTotal }),
              }
            : null
        }
      >
        {experiences.map((experience) => (
          <ExperienceCard
            key={experience.id}
            experience={experience}
            locale={locale}
            destinationSlug={slug}
          />
        ))}
      </Section>

      <Section
        title="Important places"
        empty="No places have been published yet."
        count={places.length}
        seeAll={
          page.placeTotal > places.length
            ? {
                href: `/${locale}/destinations/${slug}/places`,
                label: t("see_all", { count: page.placeTotal }),
              }
            : null
        }
      >
        {places.map((place) => (
          <PlaceCard key={place.id} place={place} locale={locale} destinationSlug={slug} />
        ))}
      </Section>

      {guidance.length > 0 ? (
        <section aria-labelledby="guidance-heading" className="flex flex-col gap-3">
          <h2 id="guidance-heading" className="text-h2">
            Practical essentials
          </h2>
          <ul className="flex flex-col gap-3">
            {guidance.map((block) => (
              <li
                key={block.id}
                className="rounded-lg border border-border bg-bg-surface p-4 text-body-sm"
              >
                {block.body.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
       * PRD F9: the oldest verification on the page, not the newest. The footer is a claim
       * about how current this page is, and the weakest part is what that claim rests on.
       */}
      {page.sources.length > 0 && oldestVerified ? (
        <SourcesFooter sources={page.sources} oldestVerified={oldestVerified} />
      ) : null}
    </main>
  );
}

/** A section that says so when it is empty, rather than collapsing and looking complete. */
function Section({
  title,
  empty,
  count,
  seeAll,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  /** PRD F2: twenty cards, then "See all". */
  seeAll: { href: string; label: string } | null;
  children: React.ReactNode;
}) {
  const id = title.toLowerCase().replace(/[^a-z]+/g, "-");

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      {count === 0 ? (
        <p className="text-body-sm text-text-secondary">{empty}</p>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
      {seeAll ? (
        <Link
          href={seeAll.href}
          className="focus-ring flex min-h-11 items-center self-start text-body-sm font-medium text-brand-primary-text"
        >
          {seeAll.label}
        </Link>
      ) : null}
    </section>
  );
}
