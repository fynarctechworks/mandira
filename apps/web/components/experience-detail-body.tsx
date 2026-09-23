import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";

import { AvailabilityCalendar } from "./availability-calendar";
import { getTranslations } from "next-intl/server";
import type { ComponentProps, ReactNode } from "react";
import { SourcesFooter } from "@mandhira/ui";

import type { ExperienceDetail } from "../lib/knowledge";
import {
  accessibilityIcons,
  availabilityLine,
  bookingLine,
  durationRange,
  formatDate,
} from "../lib/present";
import { AccessibilityIcons } from "./accessibility-icons";
import { AddToJourney } from "./add-to-journey";
import { FactRow } from "./fact-row";
import { FieldTrust } from "./field-trust";
import { ReportAChange } from "./report-a-change";

/**
 * Experience detail (PRD F2 / F9), shared by the traveler's page and the Ops preview
 * (OPS-PREVIEW-01), so what an operator previews is the page travelers get.
 *
 * Booking sits directly under the heading, above the description. PRD F2's acceptance
 * criterion is that a traveler can tell whether anything needs advance booking within
 * sixty seconds — and the one that needs sixty days' notice is not something to find below
 * three paragraphs of significance.
 */
export async function ExperienceDetailBody({
  experience,
  locale,
  actions,
  banner,
}: {
  experience: ExperienceDetail;
  locale: string;
  /**
   * Adding to a journey and reporting a change. Absent on an Ops preview: both write against
   * an entity travelers may not be able to see.
   */
  actions?: {
    journeys: ComponentProps<typeof AddToJourney>["journeys"];
    signInHref: string | null;
  };
  /** Shown above everything else — the Ops preview's banner. */
  banner?: ReactNode;
}) {
  const slug = experience.destinationSlug;
  const [tFields, tPresent, tCommon, tSources] = await Promise.all([
    getTranslations("knowledgeFields"),
    getTranslations("present"),
    getTranslations("common"),
    getTranslations("sourcesFooter"),
  ]);
  const availability = availabilityLine(experience.availability, locale, tPresent);
  const duration = durationRange(
    experience.durationLikelyMinutes,
    experience.durationMaxMinutes,
    tPresent,
  );
  const confirmed = (iso: string | null) => formatDate(iso, locale) ?? tCommon("not_recorded");
  const oldestVerified = formatDate(experience.oldestVerifiedAt, locale);

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
        <h1 className="text-display">{experience.name.text}</h1>
        {experience.placeName && experience.placeSlug ? (
          <Link
            href={`/${locale}/destinations/${slug}/places/${experience.placeSlug}`}
            className="flex min-h-11 items-center gap-1.5 text-body-sm text-text-secondary"
          >
            <MapPin className="size-4" aria-hidden />
            {experience.placeName.text}
          </Link>
        ) : null}
        {experience.significance.text ? (
          <p className="text-body">{experience.significance.text}</p>
        ) : null}
      </header>

      {/* PRD-DISC-004: the way from discovery into a plan. */}
      {actions ? (
        <AddToJourney
          experienceId={experience.id}
          experienceName={experience.name.text}
          journeys={actions.journeys}
          planHref={`/${locale}/plan?destination=${encodeURIComponent(slug)}&must=${experience.id}`}
          signInHref={actions.signInHref}
          locale={locale}
        />
      ) : null}

      {/* Above the description, deliberately. See the note at the top of this file. */}
      {experience.advanceBookingRequired ? (
        <section
          aria-labelledby="booking"
          className="flex flex-col gap-2 rounded-lg border border-status-tight bg-bg-surface p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="booking" className="text-h3">
              {bookingLine(true, experience.advanceBookingOpensDaysBefore, tPresent)}
            </h2>
            {/*
             * The badge belongs on the requirement itself. This is the field the fixture
             * flags as conflicted, and it is the one worth checking before relying on a
             * booking window that opens two months out.
             */}
            <FieldTrust
              {...(actions
                ? {
                    report: {
                      entityTable: "experiences" as const,
                      entityId: experience.id,
                      entityName: experience.name.text,
                      fieldName: "advance_booking_how_i18n",
                      locale,
                    },
                  }
                : {})}
              entry={experience.trust["advance_booking_how_i18n"]}
              fieldLabel={tFields("booking")}
              lastConfirmed={confirmed(
                experience.trust["advance_booking_how_i18n"]?.verified_at ?? null,
              )}
            />
          </div>
          {experience.advanceBookingHow.text ? (
            <p className="text-body-sm">{experience.advanceBookingHow.text}</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="when" className="flex flex-col gap-2">
        <h2 id="when" className="text-h2">
          {tFields("when")}
        </h2>
        <dl className="rounded-lg border border-border bg-bg-surface p-4">
          <FactRow
            label={tFields("availability")}
            value={availability}
            trust={experience.availabilityTrust}
            lastConfirmed={confirmed(experience.availabilityTrust?.verified_at ?? null)}
          />
          <FactRow label={tFields("how_long")} value={duration} />
          <FactRow label={tFields("queue")} value={experience.queueExpectation} />
        </dl>
        {/* PRD §5 A06: the fortnight, day by day — "is it on while I am there?" */}
        <AvailabilityCalendar days={experience.calendar} locale={locale} />
      </section>

      {experience.description.text ||
      experience.eligibility.text ||
      experience.preparation.text ||
      experience.costNote.text ? (
        <section aria-labelledby="about" className="flex flex-col gap-2">
          <h2 id="about" className="text-h2">
            {tFields("about_this")}
          </h2>
          <dl className="rounded-lg border border-border bg-bg-surface p-4">
            <FactRow label={tFields("what_happens")} value={experience.description} />
            <FactRow label={tFields("who_can_take_part")} value={experience.eligibility} />
            <FactRow label={tFields("how_to_prepare")} value={experience.preparation} />
            {/* Cost carries no trust record of its own in §4.4, so it carries no badge. */}
            <FactRow label={tFields("cost")} value={experience.costNote} />
          </dl>
        </section>
      ) : null}

      {experience.accessibility ? (
        <section aria-labelledby="access" className="flex flex-col gap-2">
          <h2 id="access" className="text-h2">
            {tFields("getting_in")}
          </h2>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4">
            <AccessibilityIcons icons={accessibilityIcons(experience.accessibility)} />
            {experience.accessibility.notes?.text ? (
              <p className="text-body-sm text-text-secondary">
                {experience.accessibility.notes.text}
              </p>
            ) : null}
            {/*
             * Named as inherited rather than presented as the experience's own. A ramp at
             * the temple is not a promise about the queue inside it.
             */}
            {experience.placeName ? (
              <p className="text-caption text-text-secondary">
                {tFields("recorded_for", { place: experience.placeName.text })}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {experience.guidance.length > 0 ? (
        <section aria-labelledby="guidance" className="flex flex-col gap-2">
          <h2 id="guidance" className="text-h2">
            {tFields("worth_knowing")}
          </h2>
          <ul className="flex flex-col gap-3">
            {experience.guidance.map((block) => (
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

      {experience.sources.length > 0 && oldestVerified ? (
        <SourcesFooter
          sources={experience.sources}
          oldestVerified={oldestVerified}
          labels={{ heading: tSources("heading"), oldestVerified: tSources("oldestVerified") }}
        />
      ) : null}

      {/* PRD F14: what a traveler does when the badge is confident and the gate says otherwise. */}
      {actions ? (
        <ReportAChange
          entityTable="experiences"
          entityId={experience.id}
          entityName={experience.name.text}
          locale={locale}
        />
      ) : null}
    </main>
  );
}
