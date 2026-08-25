import { Clock } from "lucide-react";
import { TrustBadge } from "@mandhira/ui";

import type { PlaceCard as Place } from "../lib/knowledge";
import { weakestTrustState } from "../lib/knowledge";
import { accessibilityIcons, durationLabel } from "../lib/present";
import { AccessibilityIcons } from "./accessibility-icons";

/** Place types read to a traveler, not to the schema. */
const PLACE_TYPE_LABELS: Record<string, string> = {
  temple: "Temple",
  shrine: "Shrine",
  sacred_site: "Sacred site",
  ghat: "Ghat",
  viewpoint: "Viewpoint",
  facility: "Facility",
  transport_point: "Transport",
  accommodation: "Stay",
  food: "Food",
};

export function PlaceCard({ place }: { place: Place }) {
  const duration = durationLabel(place.visitDurationLikelyMinutes);
  const trust = weakestTrustState(place.trust);
  const typeLabel = PLACE_TYPE_LABELS[place.placeType] ?? place.placeType;

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-h3">{place.name.text}</h3>
          <p className="text-caption text-text-secondary">{typeLabel}</p>
        </div>
        {trust ? <TrustBadge state={trust} /> : null}
      </div>

      {place.summary.text ? (
        <p className="text-body-sm text-text-secondary">{place.summary.text}</p>
      ) : null}

      {duration ? (
        <p className="flex items-center gap-1.5 text-caption text-text-secondary">
          <Clock className="size-4 shrink-0" aria-hidden />
          Usually {duration}
        </p>
      ) : null}

      <AccessibilityIcons icons={accessibilityIcons(place.accessibility)} />

      {/*
       * Said out loud rather than left blank. For a wheelchair user, "we have not checked"
       * and "it has none of these" are different answers, and silence reads as the second.
       */}
      {place.accessibility === null ? (
        <p className="text-caption text-text-secondary">
          We don&apos;t have accessibility information for this place yet.
        </p>
      ) : null}
    </article>
  );
}
