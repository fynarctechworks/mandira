import { CalendarClock, ChevronRight, Clock, Ticket } from "lucide-react";
import Link from "next/link";
import { TrustBadge } from "@mandhira/ui";
import { useTranslations } from "next-intl";

import type { ExperienceCard as Experience } from "../lib/knowledge";
import { weakestTrustState } from "../lib/knowledge";
import { accessibilityIcons, availabilityLine, bookingLine, durationLabel } from "../lib/present";
import { AccessibilityIcons } from "./accessibility-icons";

/**
 * PRD F2's experience card: name, one-line significance, availability in plain language,
 * likely duration, advance-booking flag, accessibility icons, trust badge.
 *
 * Every one of those is required by the acceptance criterion — a traveler must be able to
 * tell what the three most significant experiences are, whether they run on their dates,
 * and whether any need booking, in sixty seconds. A card missing the booking flag is a
 * card that fails that quietly, on the one experience that needed sixty days' notice.
 *
 * The badge shows the WEAKEST state across the card's fields. One "Verified" beside an
 * unshown "Check locally" would be technically true and practically a lie.
 */
export function ExperienceCard({
  experience,
  locale,
  destinationSlug,
}: {
  experience: Experience;
  locale: string;
  destinationSlug: string;
}) {
  const t = useTranslations("knowledgeFields");
  const tBadge = useTranslations("trustBadge");
  const tPresent = useTranslations("present");
  const tPhrases = useTranslations("phrases");
  const tSearch = useTranslations("search");
  const availability = availabilityLine(experience.availability, locale, tPresent);
  const duration = durationLabel(experience.durationLikelyMinutes, tPresent);
  const booking = bookingLine(
    experience.advanceBookingRequired,
    experience.advanceBookingOpensDaysBefore,
    tPresent,
  );
  const trust = weakestTrustState(experience.trust);

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4">
      {experience.fitsJourney ? (
        <p className="text-caption font-medium text-primary-text">{tSearch("fits_journey")}</p>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-h3">
          {/*
           * The whole card is not the link. A card carries a trust badge that opens a
           * sheet, and nesting an interactive badge inside a link is both an accessibility
           * failure and a way to open the wrong thing with a thumb.
           */}
          <Link
            href={`/${locale}/destinations/${destinationSlug}/experiences/${experience.slug}`}
            className="flex min-h-11 items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {experience.name.text}
            <ChevronRight className="size-5 shrink-0 text-text-secondary" aria-hidden />
          </Link>
        </h3>
        {trust ? (
          <div className="flex">
            <TrustBadge state={trust} label={tBadge(trust)} />
          </div>
        ) : null}
      </div>

      {experience.significance.text ? (
        <p className="text-body-sm text-text-secondary">{experience.significance.text}</p>
      ) : null}

      <dl className="flex flex-col gap-1 text-caption text-text-secondary">
        {availability ? (
          <div className="flex items-center gap-1.5">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">{t("availability")}</dt>
            <dd>{availability}</dd>
          </div>
        ) : null}

        {duration ? (
          <div className="flex items-center gap-1.5">
            <Clock className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">{t("usually_takes")}</dt>
            <dd>{tPresent("usually", { usual: duration })}</dd>
          </div>
        ) : null}

        {booking ? (
          <div className="flex items-center gap-1.5 text-text-primary">
            <Ticket className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">{t("booking")}</dt>
            <dd>{booking}</dd>
          </div>
        ) : null}
      </dl>

      <AccessibilityIcons icons={accessibilityIcons(experience.accessibility)} />

      {/* PRD-KNOW-005: a traveler reading English instead of their language is told so. */}
      {experience.name.isFallback ? (
        <p className="text-caption text-text-secondary">{tPhrases("not_in_language")}</p>
      ) : null}
    </article>
  );
}
