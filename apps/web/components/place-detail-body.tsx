import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SourcesFooter } from "@mandhira/ui";

import type { PlaceDetail } from "../lib/knowledge";
import { accessibilityIcons, durationRange, formatDate, openingWeek } from "../lib/present";
import { AccessibilityIcons } from "./accessibility-icons";
import { FactRow } from "./fact-row";
import { FieldTrust } from "./field-trust";
import { OpenInMaps } from "./open-in-maps";
import { PhrasesLink } from "./phrases-link";
import { ReportAChange } from "./report-a-change";
import { SavePlaceToggle } from "./save-place-toggle";

/**
 * Place detail (PRD F2 / F9), shared by the traveler's page and the Ops preview
 * (OPS-PREVIEW-01), so what an operator previews is the page travelers get.
 *
 * Every critical field carries its OWN trust badge here, which is the point of the page:
 * the card summarised to the weakest state (D-083), and this is where a traveler finds out
 * which field that was. "The hours are solid, it's the entry requirements nobody has
 * checked lately" is a different instruction from "be careful about this place".
 */
export async function PlaceDetailBody({
  place,
  locale,
  actions,
  banner,
}: {
  place: PlaceDetail;
  locale: string;
  /**
   * Saving the place and reporting a change. Absent on an Ops preview: both write against an
   * entity travelers may not be able to see.
   */
  actions?: { saved: boolean; signInHref: string | null };
  /** Shown above everything else — the Ops preview's banner. */
  banner?: ReactNode;
}) {
  const slug = place.destinationSlug;
  const [tFields, tPresent, tCommon, tSources] = await Promise.all([
    getTranslations("knowledgeFields"),
    getTranslations("present"),
    getTranslations("common"),
    getTranslations("sourcesFooter"),
  ]);
  const week = openingWeek(place.openingSchedule, locale);
  const duration = durationRange(
    place.visitDurationLikelyMinutes,
    place.visitDurationMaxMinutes,
    tPresent,
  );
  const confirmed = (iso: string | null) => formatDate(iso, locale) ?? tCommon("not_recorded");
  const oldestVerified = formatDate(place.oldestVerifiedAt, locale);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      {banner}

      <Link
        href={`/${locale}/destinations/${slug}`}
        className="flex min-h-11 items-center gap-2 text-body-sm text-text-secondary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {tFields("back_to_destination")}
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

        {actions ? (
          <SavePlaceToggle
            placeId={place.id}
            initialSaved={actions.saved}
            signInHref={actions.signInHref}
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
              {tFields("opening_hours")}
            </h2>
            <FieldTrust
              {...(actions
                ? {
                    report: {
                      entityTable: "places" as const,
                      entityId: place.id,
                      entityName: place.name.text,
                      fieldName: "opening_schedule",
                      locale,
                    },
                  }
                : {})}
              entry={place.trust["opening_schedule"]}
              fieldLabel={tFields("opening_hours")}
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
                  {day.hours ?? tFields("closed")}
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
          {tFields("before_you_go")}
        </h2>
        <dl className="rounded-lg border border-border bg-bg-surface p-4">
          <FactRow
            label={tFields("entry_requirements")}
            value={place.entryRequirements}
            trust={place.trust["entry_requirements_i18n"]}
            lastConfirmed={confirmed(place.trust["entry_requirements_i18n"]?.verified_at ?? null)}
          />
          <FactRow label={tFields("dress_code")} value={place.dressCode} />
          <FactRow
            label={tFields("closures")}
            value={place.closureRules}
            trust={place.trust["closure_rules_i18n"]}
            lastConfirmed={confirmed(place.trust["closure_rules_i18n"]?.verified_at ?? null)}
          />
          <FactRow label={tFields("how_long")} value={duration} />
        </dl>
      </section>

      <section aria-labelledby="access" className="flex flex-col gap-2">
        <h2 id="access" className="text-h2">
          {tFields("getting_in")}
        </h2>
        {place.accessibility ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4">
            <AccessibilityIcons icons={accessibilityIcons(place.accessibility)} />
            {place.accessibility.distance_from_dropoff_m != null ? (
              <p className="text-body-sm">
                {tFields("dropoff", { metres: place.accessibility.distance_from_dropoff_m })}
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
            {tFields("no_access_info")}
          </p>
        )}
      </section>

      {place.guidance.length > 0 ? (
        <section aria-labelledby="guidance" className="flex flex-col gap-2">
          <h2 id="guidance" className="text-h2">
            {tFields("worth_knowing")}
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

      <PhrasesLink locale={locale} destinationSlug={slug} />

      {place.sources.length > 0 && oldestVerified ? (
        <SourcesFooter
          sources={place.sources}
          oldestVerified={oldestVerified}
          labels={{ heading: tSources("heading"), oldestVerified: tSources("oldestVerified") }}
        />
      ) : null}

      {/*
        PRD F14, and the other half of the trust model. Every critical fact on this page
        carries a badge saying how sure we are; this is what a traveler does when the badge
        is confident and the gate in front of them says otherwise.
      */}
      {actions ? (
        <ReportAChange
          entityTable="places"
          entityId={place.id}
          entityName={place.name.text}
          locale={locale}
        />
      ) : null}
    </main>
  );
}
