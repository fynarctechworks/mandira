import { Search } from "lucide-react";
import { setRequestLocale } from "next-intl/server";

import { ExperienceCard } from "../../../components/experience-card";
import { FilterBar } from "../../../components/filter-bar";
import { PlaceCard } from "../../../components/place-card";
import { getDestinationCards, searchKnowledge, type SearchFilters } from "../../../lib/knowledge";

/**
 * Search results (A03, SRCH-01).
 *
 * A plain GET form, so a search is a URL: shareable, back-button-able, and readable
 * offline from the browser's own history. It also means the whole screen is server
 * rendered and works before any JavaScript arrives — which for a traveler on a hill with
 * one bar is the difference between a result and a spinner.
 */
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  type?: string;
  access?: string;
  duration?: string;
  booking?: string;
};

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const q = query.q ?? "";
  const filters = toFilters(query);

  const [results, destinations] = await Promise.all([
    searchKnowledge(q, filters, locale),
    // Results carry no destination name of their own, so the slug is resolved once here
    // rather than per card.
    getDestinationCards(locale, 20),
  ]);

  const slugById = new Map(destinations.map((d) => [d.id, d.slug]));
  const total = results.experiences.length + results.places.length;
  const searched = q.trim().length > 0 || results.filtersApplied;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-6">
      <h1 className="text-h1">Search</h1>

      <form method="get" role="search" className="flex flex-col gap-3">
        <label htmlFor="q" className="sr-only">
          What are you looking for?
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-surface px-3">
          <Search className="size-5 shrink-0 text-text-secondary" aria-hidden />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="A place, a ritual, a name…"
            className="min-h-11 flex-1 bg-transparent text-body outline-none"
          />
        </div>

        <FilterBar filters={filters} />

        <button
          type="submit"
          className="focus-ring min-h-11 rounded-lg bg-brand-primary px-4 text-body font-medium text-brand-primary-on"
        >
          Search
        </button>
      </form>

      {!searched ? (
        <p className="text-body-sm text-text-secondary">
          Search published places and experiences, or narrow by the filters above.
        </p>
      ) : total === 0 ? (
        /*
         * Two different empty states, because they call for two different next moves. A
         * query that matched nothing means try other words; filters that matched nothing
         * means loosen them — and telling someone to rephrase when the problem is a filter
         * they set is how a search feels broken.
         */
        <p className="text-body-sm text-text-secondary">
          {results.filtersApplied
            ? "Nothing matches those filters. Try removing one."
            : "Nothing matched that. Try a different word — we only search information that has been published and reviewed."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-caption text-text-secondary" role="status">
            {total} {total === 1 ? "result" : "results"}
          </p>

          {results.experiences.length > 0 ? (
            <section aria-labelledby="experiences" className="flex flex-col gap-3">
              <h2 id="experiences" className="text-h2">
                Experiences
              </h2>
              {results.experiences.map((experience) => (
                <ExperienceCard
                  key={experience.id}
                  experience={experience}
                  locale={locale}
                  destinationSlug={slugById.get(experience.destinationId) ?? ""}
                />
              ))}
            </section>
          ) : null}

          {results.places.length > 0 ? (
            <section aria-labelledby="places" className="flex flex-col gap-3">
              <h2 id="places" className="text-h2">
                Places
              </h2>
              {results.places.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  locale={locale}
                  destinationSlug={slugById.get(place.destinationId) ?? ""}
                />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}

/** Query string → filters, ignoring anything that is not a value we offer. */
function toFilters(query: SearchParams): SearchFilters {
  const duration = Number(query.duration);

  return {
    ...(query.type ? { type: query.type } : {}),
    ...(query.access === "step_free" ? { stepFreeOnly: true } : {}),
    ...(Number.isFinite(duration) && duration > 0 ? { maxDurationMinutes: duration } : {}),
    ...(query.booking === "yes"
      ? { advanceBooking: true }
      : query.booking === "no"
        ? { advanceBooking: false }
        : {}),
  };
}
