import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AccessibilityIcons } from "../../../../../../components/accessibility-icons";
import { FactRow } from "../../../../../../components/fact-row";
import { FieldTrust } from "../../../../../../components/field-trust";
import { OpenInMaps } from "../../../../../../components/open-in-maps";
import { PhrasesLink } from "../../../../../../components/phrases-link";
import { ReportAChange } from "../../../../../../components/report-a-change";
import { SavePlaceToggle } from "../../../../../../components/save-place-toggle";
import { getPlaceDetail } from "../../../../../../lib/knowledge";
import {
  accessibilityIcons,
  durationRange,
  formatDate,
  openingWeek,
} from "../../../../../../lib/present";
import { isPlaceSaved } from "../../../../../../lib/saved-places";
import { webSupabase } from "../../../../../../lib/supabase";

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

  const [tFields, tPresent, tCommon] = await Promise.all([
    getTranslations("knowledgeFields"),
    getTranslations("present"),
    getTranslations("common"),
  ]);
  const week = openingWeek(place.openingSchedule, locale);
  const duration = durationRange(
    place.visitDurationLikelyMinutes,
    place.visitDurationMaxMinutes,
    tPresent,
  );
  const confirmed = (iso: string | null) => formatDate(iso, locale) ?? tCommon("not_recorded");

  const supabase = await webSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const saved = user ? await isPlaceSaved(supabase, user.id, place.id) : false;
  const here = `/${locale}/destinations/${slug}/places/${placeSlug}`;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
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

        <SavePlaceToggle
          placeId={place.id}
          initialSaved={saved}
          signInHref={user ? null : `/${locale}/sign-in?next=${encodeURIComponent(here)}`}
        />
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

      {/*
        PRD F14, and the other half of the trust model. Every critical fact on this page
        carries a badge saying how sure we are; this is what a traveler does when the badge
        is confident and the gate in front of them says otherwise.
      */}
      <ReportAChange
        entityTable="places"
        entityId={place.id}
        entityName={place.name.text}
        locale={locale}
      />
    </main>
  );
}
