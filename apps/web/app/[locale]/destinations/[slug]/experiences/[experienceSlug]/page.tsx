import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { AccessibilityIcons } from "../../../../../../components/accessibility-icons";
import { FactRow } from "../../../../../../components/fact-row";
import { FieldTrust } from "../../../../../../components/field-trust";
import { getExperienceDetail } from "../../../../../../lib/knowledge";
import {
  accessibilityIcons,
  availabilityLine,
  durationRange,
  formatDate,
} from "../../../../../../lib/present";

/**
 * Experience detail (PRD F2 / F9).
 *
 * Booking sits directly under the heading, above the description. PRD F2's acceptance
 * criterion is that a traveler can tell whether anything needs advance booking within
 * sixty seconds — and the one that needs sixty days' notice is not something to find below
 * three paragraphs of significance.
 */
export const dynamic = "force-dynamic";

export default async function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; experienceSlug: string }>;
}) {
  const { locale, slug, experienceSlug } = await params;
  setRequestLocale(locale);

  const experience = await getExperienceDetail(slug, experienceSlug, locale);
  if (!experience) notFound();

  const availability = availabilityLine(experience.availability, locale);
  const duration = durationRange(experience.durationLikelyMinutes, experience.durationMaxMinutes);
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

      {/* Above the description, deliberately. See the note at the top of this file. */}
      {experience.advanceBookingRequired ? (
        <section
          aria-labelledby="booking"
          className="flex flex-col gap-2 rounded-lg border border-status-tight bg-bg-surface p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="booking" className="text-h3">
              {experience.advanceBookingOpensDaysBefore
                ? `Advance booking required — opens ${experience.advanceBookingOpensDaysBefore} days before`
                : "Advance booking required"}
            </h2>
            {/*
             * The badge belongs on the requirement itself. This is the field the fixture
             * flags as conflicted, and it is the one worth checking before relying on a
             * booking window that opens two months out.
             */}
            <FieldTrust
              entry={experience.trust["advance_booking_how_i18n"]}
              fieldLabel="Booking"
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
          When
        </h2>
        <dl className="rounded-lg border border-border bg-bg-surface p-4">
          <FactRow
            label="Availability"
            value={availability}
            trust={experience.availabilityTrust}
            lastConfirmed={confirmed(experience.availabilityTrust?.verified_at ?? null)}
          />
          <FactRow label="How long to allow" value={duration} />
          <FactRow label="What the queue is usually like" value={experience.queueExpectation} />
        </dl>
      </section>

      {experience.description.text ||
      experience.eligibility.text ||
      experience.preparation.text ||
      experience.costNote.text ? (
        <section aria-labelledby="about" className="flex flex-col gap-2">
          <h2 id="about" className="text-h2">
            About this
          </h2>
          <dl className="rounded-lg border border-border bg-bg-surface p-4">
            <FactRow label="What happens" value={experience.description} />
            <FactRow label="Who can take part" value={experience.eligibility} />
            <FactRow label="How to prepare" value={experience.preparation} />
            {/* Cost carries no trust record of its own in §4.4, so it carries no badge. */}
            <FactRow label="Cost" value={experience.costNote} />
          </dl>
        </section>
      ) : null}

      {experience.accessibility ? (
        <section aria-labelledby="access" className="flex flex-col gap-2">
          <h2 id="access" className="text-h2">
            Getting in
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
                Recorded for {experience.placeName.text}.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {experience.guidance.length > 0 ? (
        <section aria-labelledby="guidance" className="flex flex-col gap-2">
          <h2 id="guidance" className="text-h2">
            Worth knowing
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
    </main>
  );
}
