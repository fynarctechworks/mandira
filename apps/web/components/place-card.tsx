import { ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { TrustBadge } from "@mandhira/ui";
import { useTranslations } from "next-intl";

import type { PlaceCard as Place } from "../lib/knowledge";
import { weakestTrustState } from "../lib/knowledge";
import { accessibilityIcons, durationLabel } from "../lib/present";
import { AccessibilityIcons } from "./accessibility-icons";

/** Place types read to a traveler, not to the schema. */

export function PlaceCard({
  place,
  locale,
  destinationSlug,
}: {
  place: Place;
  locale: string;
  destinationSlug: string;
}) {
  const t = useTranslations("knowledgeFields");
  const tBadge = useTranslations("trustBadge");
  const tTypes = useTranslations("placeTypes");
  const tPresent = useTranslations("present");
  const tSearch = useTranslations("search");
  const duration = durationLabel(place.visitDurationLikelyMinutes, tPresent);
  const trust = weakestTrustState(place.trust);
  // A type added to the schema before the catalogs shows its raw value rather than a key path.
  const typeLabel = tTypes.has(place.placeType) ? tTypes(place.placeType) : place.placeType;

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4">
      {place.fitsJourney ? (
        <p className="text-caption font-medium text-primary-text">{tSearch("fits_journey")}</p>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-h3">
            <Link
              href={`/${locale}/destinations/${destinationSlug}/places/${place.slug}`}
              className="flex min-h-11 items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              {place.name.text}
              <ChevronRight className="size-5 shrink-0 text-text-secondary" aria-hidden />
            </Link>
          </h3>
          <p className="text-caption text-text-secondary">{typeLabel}</p>
        </div>
        {trust ? <TrustBadge state={trust} label={tBadge(trust)} /> : null}
      </div>

      {place.summary.text ? (
        <p className="text-body-sm text-text-secondary">{place.summary.text}</p>
      ) : null}

      {duration ? (
        <p className="flex items-center gap-1.5 text-caption text-text-secondary">
          <Clock className="size-4 shrink-0" aria-hidden />
          {tPresent("usually", { usual: duration })}
        </p>
      ) : null}

      <AccessibilityIcons icons={accessibilityIcons(place.accessibility)} />

      {/*
       * Said out loud rather than left blank. For a wheelchair user, "we have not checked"
       * and "it has none of these" are different answers, and silence reads as the second.
       */}
      {place.accessibility === null ? (
        <p className="text-caption text-text-secondary">{t("no_access_info_short")}</p>
      ) : null}
    </article>
  );
}
