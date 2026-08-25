import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { AccessibilityIcons } from "../../../../../../components/accessibility-icons";
import { FactRow } from "../../../../../../components/fact-row";
import { FieldTrust } from "../../../../../../components/field-trust";
import { OpenInMaps } from "../../../../../../components/open-in-maps";
import { getPlaceDetail } from "../../../../../../lib/knowledge";
import {
  accessibilityIcons,
  durationRange,
  formatDate,
  openingWeek,
} from "../../../../../../lib/present";

/**
 * Place detail (PRD F2 / F9).
 *
 * Every critical field carries its OWN trust badge here, which is the point of the page:
 * the card summarised to the weakest state (D-083), and this is where a traveler finds out
 * which field that was. "The hours are solid, it's the entry requirements nobody has
 * checked lately" is a different instruction from "be careful about this place".
 */
export const dynamic = "force-dynamic";

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; placeSlug: string }>;
}) {
  const { locale, slug, placeSlug } = await params;
  setRequestLocale(locale);

  const place = await getPlaceDetail(slug, placeSlug, locale);
  if (!place) notFound();

  const week = openingWeek(place.openingSchedule, locale);
  const duration = durationRange(place.visitDurationLikelyMinutes, place.visitDurationMaxMinutes);
  const confirmed = (iso: string | null) => formatDate(iso, locale) ?? "Not recorded";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <Link
        href={`/${locale}/destinations/${slug}`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to the destination
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-display">{place.name.text}</h1>
        {place.address ? <p className="text-body-sm text-text-secondary">{place.address}</p> : null}
        {place.summary.text ? <p className="text-body">{place.summary.text}</p> : null}

        {/*
         * MAPS-03. Rendered only when there is a pin — a place can be published without
         * one, and a hand-off to coordinates nobody recorded sends a traveler to 0,0 in
         * the Atlantic with complete confidence.
         */}
        {place.latitude != null && place.longitude != null ? (
          <OpenInMaps
            latitude={place.latitude}
            longitude={place.longitude}
            label={place.name.text}
          />
        ) : null}
      </header>

      {week.length > 0 ? (
        <section aria-labelledby="hours" className="flex flex-col gap-2">
          {/*
           * The badge sits on the heading, not on a row repeating it. One trust record
           * covers the whole schedule, and a row labelled "Opening hours" inside a section
           * called "Opening hours" is a line of text that carries no information.
           */}
          <div className="flex items-center justify-between gap-3">
            <h2 id="hours" className="text-h2">
              Opening hours
            </h2>
            <FieldTrust
              entry={place.trust["opening_schedule"]}
              fieldLabel="Opening hours"
              lastConfirmed={confirmed(place.trust["opening_schedule"]?.verified_at ?? null)}
              validUntil={
                formatDate(place.trust["opening_schedule"]?.valid_until ?? null, locale) ??
                undefined
              }
            />
          </div>
          <dl className="rounded-lg border border-border bg-bg-surface p-4">
            {week.map((day) => (
              <div
                key={day.day}
                className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0"
              >
                <dt className="text-body-sm text-text-secondary">{day.day}</dt>
                {/*
                 * A day with no hours is named as closed rather than omitted. A list that
                 * silently skips Tuesday reads as an oversight; "Tuesday — closed" is the
                 * answer someone travelled to find out.
                 */}
                <dd className={day.hours ? "text-body" : "text-body text-text-secondary"}>
                  {day.hours ?? "Closed"}
                </dd>
              </div>
            ))}
          </dl>
          {place.hoursNote.text ? (
            <p className="text-body-sm text-text-secondary">{place.hoursNote.text}</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="before-you-go" className="flex flex-col gap-2">
        <h2 id="before-you-go" className="text-h2">
          Before you go
        </h2>
        <dl className="rounded-lg border border-border bg-bg-surface p-4">
          <FactRow
            label="Entry requirements"
            value={place.entryRequirements}
            trust={place.trust["entry_requirements_i18n"]}
            lastConfirmed={confirmed(place.trust["entry_requirements_i18n"]?.verified_at ?? null)}
          />
          <FactRow label="Dress code" value={place.dressCode} />
          <FactRow
            label="Closures"
            value={place.closureRules}
            trust={place.trust["closure_rules_i18n"]}
            lastConfirmed={confirmed(place.trust["closure_rules_i18n"]?.verified_at ?? null)}
          />
          <FactRow label="How long to allow" value={duration} />
        </dl>
      </section>

      <section aria-labelledby="access" className="flex flex-col gap-2">
        <h2 id="access" className="text-h2">
          Getting in
        </h2>
        {place.accessibility ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4">
            <AccessibilityIcons icons={accessibilityIcons(place.accessibility)} />
            {place.accessibility.distance_from_dropoff_m != null ? (
              <p className="text-body-sm">
                About {place.accessibility.distance_from_dropoff_m} m from the nearest drop-off.
              </p>
            ) : null}
            {place.accessibility.notes?.text ? (
              <p className="text-body-sm text-text-secondary">{place.accessibility.notes.text}</p>
            ) : null}
          </div>
        ) : (
          /*
           * Said in full on the page that exists to answer it. Someone who navigated here
           * to find out whether they can get in deserves a sentence, not an empty section.
           */
          <p className="rounded-lg border border-border bg-bg-surface p-4 text-body-sm text-text-secondary">
            We don&apos;t have accessibility information for this place yet. If you find out, you
            can tell us and we&apos;ll check it.
          </p>
        )}
      </section>

      {place.guidance.length > 0 ? (
        <section aria-labelledby="guidance" className="flex flex-col gap-2">
          <h2 id="guidance" className="text-h2">
            Worth knowing
          </h2>
          <ul className="flex flex-col gap-3">
            {place.guidance.map((block) => (
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
    </main>
  );
}
