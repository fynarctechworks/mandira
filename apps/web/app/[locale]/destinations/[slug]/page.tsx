import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SourcesFooter } from "@mandhira/ui";

import { ExperienceCard } from "../../../../components/experience-card";
import { PhrasesLink } from "../../../../components/phrases-link";
import { PlaceCard } from "../../../../components/place-card";
import { getDestinationPage } from "../../../../lib/knowledge";
import { durationLabel, formatDate } from "../../../../lib/present";

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
  const [t, tPage, tPresent, tSources] = await Promise.all([
    getTranslations("discovery"),
    getTranslations("destinationPage"),
    getTranslations("present"),
    getTranslations("sourcesFooter"),
  ]);

  // Dates and clock times in the reader's language, for the next occurrence of a ritual.
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const nextLine = (next: (typeof page.rituals)[number]["next"]) => {
    if (!next) return tPage("no_upcoming");
    const date = day.format(new Date(`${next.date}T00:00:00Z`));
    return next.start
      ? tPage("next_on_time", {
          date,
          time: clock.format(new Date(`2000-01-01T${next.start}:00Z`)),
        })
      : tPage("next_on", { date });
  };

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
        <section aria-label={tPage("advisories")} className="flex flex-col gap-3">
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
        id="what-people-come-here-for"
        title={t("experiences_title")}
        empty={tPage("empty_experiences")}
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
        id="important-places"
        title={t("places_title")}
        empty={tPage("empty_places")}
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

      {/* PRD F2's order continues: rituals and events, seasons, then practical essentials. */}
      <Section
        id="rituals"
        title={tPage("rituals")}
        empty={tPage("rituals_empty")}
        count={page.rituals.length}
        seeAll={null}
      >
        {page.rituals.map((ritual) => (
          <article
            key={ritual.id}
            className="flex flex-col gap-1 rounded-lg border border-border bg-bg-surface p-4"
          >
            <h3 className="text-h3">
              <Link
                href={`/${locale}/destinations/${slug}/experiences/${ritual.slug}`}
                className="focus-ring flex min-h-11 items-center"
              >
                {ritual.name.text}
              </Link>
            </h3>
            {ritual.significance.text ? (
              <p className="text-body-sm text-text-secondary">{ritual.significance.text}</p>
            ) : null}
            <p className="text-body-sm font-medium">{nextLine(ritual.next)}</p>
          </article>
        ))}
      </Section>

      {page.seasons.best.text || page.seasons.notes.text ? (
        <section aria-labelledby="seasons-heading" className="flex flex-col gap-2">
          <h2 id="seasons-heading" className="text-h2">
            {tPage("seasonal")}
          </h2>
          {page.seasons.best.text ? (
            <p className="text-body-sm font-medium">
              {tPage("best_seasons_line", { seasons: page.seasons.best.text })}
            </p>
          ) : null}
          {page.seasons.notes.text ? (
            <p className="text-body-sm text-text-secondary">{page.seasons.notes.text}</p>
          ) : null}
        </section>
      ) : null}

      {guidance.length > 0 ? (
        <section aria-labelledby="guidance-heading" className="flex flex-col gap-3">
          <h2 id="guidance-heading" className="text-h2">
            {tPage("essentials")}
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
       * Said even when nothing has been checked: for a wheelchair user "not checked" and
       * "no step-free access" are different answers, and silence reads as the second (D-080).
       */}
      <section aria-labelledby="accessibility-heading" className="flex flex-col gap-2">
        <h2 id="accessibility-heading" className="text-h2">
          {tPage("accessibility")}
        </h2>
        <p className="text-body-sm">
          {page.accessibilitySummary.recorded === 0
            ? tPage("access_unrecorded")
            : tPage("access_counts", {
                stepFree: page.accessibilitySummary.stepFree,
                recorded: page.accessibilitySummary.recorded,
              })}
        </p>
        {page.accessibilitySummary.notes.map((note) => (
          <p
            key={note.id}
            className="rounded-lg border border-border bg-bg-surface p-4 text-body-sm"
          >
            {note.body.text}
          </p>
        ))}
      </section>

      {page.transport.length > 0 ? (
        <section aria-labelledby="getting-there-heading" className="flex flex-col gap-3">
          <h2 id="getting-there-heading" className="text-h2">
            {tPage("getting_there")}
          </h2>
          <ul className="flex flex-col gap-2">
            {page.transport.map((leg) => {
              const duration = durationLabel(leg.durationLikelyMinutes, tPresent);
              return (
                <li
                  key={leg.id}
                  className="flex flex-col gap-0.5 rounded-lg border border-border bg-bg-surface p-4"
                >
                  <span className="text-body font-medium">{tPage(`modes.${leg.mode}`)}</span>
                  {leg.operator ? (
                    <span className="text-body-sm text-text-secondary">{leg.operator}</span>
                  ) : null}
                  {duration ? (
                    <span className="text-body-sm text-text-secondary">
                      {tPage("about", { duration })}
                    </span>
                  ) : null}
                  {leg.frequency.text ? (
                    <span className="text-body-sm text-text-secondary">{leg.frequency.text}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {page.nearby.length > 0 ? (
        <section aria-labelledby="nearby-heading" className="flex flex-col gap-3">
          <h2 id="nearby-heading" className="text-h2">
            {tPage("nearby")}
          </h2>
          <ul className="flex flex-col gap-2">
            {page.nearby.map((place) => (
              <li key={place.slug}>
                <Link
                  href={`/${locale}/destinations/${place.slug}`}
                  className="focus-ring flex min-h-11 flex-col justify-center gap-0.5 rounded-lg border border-border bg-bg-surface p-4"
                >
                  <span className="text-h3">{place.name.text}</span>
                  {place.note.text ? (
                    <span className="text-body-sm text-text-secondary">{place.note.text}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PhrasesLink locale={locale} destinationSlug={slug} />

      {/*
       * PRD F9: the oldest verification on the page, not the newest. The footer is a claim
       * about how current this page is, and the weakest part is what that claim rests on.
       */}
      {page.sources.length > 0 && oldestVerified ? (
        <SourcesFooter
          sources={page.sources}
          oldestVerified={oldestVerified}
          labels={{ heading: tSources("heading"), oldestVerified: tSources("oldestVerified") }}
        />
      ) : null}
    </main>
  );
}

/** A section that says so when it is empty, rather than collapsing and looking complete. */
function Section({
  id,
  title,
  empty,
  count,
  seeAll,
  children,
}: {
  /** Fixed per section: an id built from the title would change with the language. */
  id: string;
  title: string;
  empty: string;
  count: number;
  /** PRD F2: twenty cards, then "See all". */
  seeAll: { href: string; label: string } | null;
  children: React.ReactNode;
}) {
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
