import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getDestinationCards } from "../../lib/knowledge";

/**
 * Traveler home (A02).
 *
 * PRD F2: up to three destination cards, a primary "Plan a journey" action, and no
 * infinite feed. There is deliberately no "trending" and no rating anywhere on this
 * screen — ranking comes from the editorial weight Ops set, which is a judgement someone
 * is accountable for, rather than from whatever was popular last week.
 */
export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, destinations] = await Promise.all([
    getTranslations("home"),
    getDestinationCards(locale),
  ]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-text-secondary">Mandhira</p>
        <h1 className="text-display">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("intro")}</p>
      </header>

      {/*
       * PRD A02 puts search on the home screen. A GET form rather than a link, so typing
       * and pressing enter goes straight to results — one interaction, and it works with
       * no JavaScript running.
       */}
      <form method="get" action={`/${locale}/search`} role="search" className="flex gap-2">
        <label htmlFor="home-search" className="sr-only">
          Search places and experiences
        </label>
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg-surface px-3">
          <Search className="size-5 shrink-0 text-text-secondary" aria-hidden />
          <input
            id="home-search"
            name="q"
            type="search"
            placeholder="A place, a ritual, a name…"
            className="min-h-11 flex-1 bg-transparent text-body outline-none"
          />
        </div>
        <button
          type="submit"
          className="focus-ring min-h-11 rounded-lg border border-border px-4 text-body-sm font-medium"
        >
          Search
        </button>
      </form>

      {/* PRD A02: the primary action on the home screen. */}
      <Link
        href={`/${locale}/plan`}
        className="focus-ring flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-4 py-3 text-body font-medium text-text-on-primary"
      >
        Plan a journey
      </Link>

      <section aria-labelledby="destinations-heading" className="flex flex-col gap-3">
        <h2 id="destinations-heading" className="text-h2">
          Where you could go
        </h2>

        {destinations.length === 0 ? (
          /*
           * An honest empty state rather than a skeleton that implies something is loading.
           * Until B-013 publishes a destination this is the true state of the product, and
           * a shimmer pretending otherwise would be the first thing the app lies about.
           */
          <p className="text-body-sm text-text-secondary">
            No destinations have been published yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {destinations.map((destination) => (
              <li key={destination.id}>
                <Link
                  href={`/${locale}/destinations/${destination.slug}`}
                  className="flex min-h-11 flex-col gap-1 rounded-lg border border-border bg-bg-surface p-4 transition-colors hover:border-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-h3">{destination.name.text}</span>
                    <ArrowRight className="size-5 shrink-0 text-text-secondary" aria-hidden />
                  </span>
                  {destination.region ? (
                    <span className="text-caption text-text-secondary">{destination.region}</span>
                  ) : null}
                  {destination.overview.text ? (
                    <span className="text-body-sm text-text-secondary">
                      {destination.overview.text}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
