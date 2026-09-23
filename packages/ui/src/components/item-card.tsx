import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { TierChip, type PriorityTier } from "./tier-chip";

type ItemCardProps = {
  /** Formatted start time for the left rail, e.g. "06:30". */
  time: string;
  title: string;
  place?: string;
  /** Formatted duration, e.g. "1 h 30 m". */
  duration?: string;
  tier: PriorityTier;
  tierLabel?: string;
  onTierChange?: () => void;
  /** Travel leg rendered as a connector below the card, e.g. "25 min by car". */
  travelLeg?: string;
  /** Trust badge or other trailing affordance. */
  trailing?: ReactNode;
  className?: string;
};

/**
 * PRD 12.5 timeline item card: left time rail, title, place, duration, tier chip,
 * travel-leg connector below. Presentational only — journey data shapes arrive with B-019.
 */
export function ItemCard({
  time,
  title,
  place,
  duration,
  tier,
  tierLabel,
  onTierChange,
  travelLeg,
  trailing,
  className,
}: ItemCardProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex gap-3">
        {/*
          A minimum, not a fixed width, and never wrapped. The rail was 56 px, which holds
          "06:30" but not "6:30 AM" — nor the Telugu and Hindi forms, which put the part of
          the day before the time — so a time broke across two lines (design review).
          Every time in one list shares a locale, so the rail stays even down the day.
        */}
        <div className="min-w-16 shrink-0 whitespace-nowrap pt-3 text-body-sm font-medium text-text-secondary tabular-nums">
          {time}
        </div>

        <div className="flex-1 rounded-card border border-border-subtle bg-surface p-3 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-body font-medium text-text-primary">{title}</p>
              {place ? <p className="text-body-sm text-text-secondary">{place}</p> : null}
            </div>
            {trailing}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TierChip
              tier={tier}
              label={tierLabel}
              readOnly={!onTierChange}
              {...(onTierChange ? { onClick: onTierChange } : {})}
            />
            {/* Tier is editable only when the caller supplies a handler (PRD Principle 6). */}
            {duration ? <span className="text-caption text-text-secondary">{duration}</span> : null}
          </div>
        </div>
      </div>

      {travelLeg ? (
        <div className="flex gap-3">
          <div className="flex w-14 shrink-0 justify-center">
            <span aria-hidden="true" className="my-1 w-px flex-1 bg-border-subtle" />
          </div>
          <p className="py-2 text-caption text-text-secondary">{travelLeg}</p>
        </div>
      ) : null}
    </div>
  );
}

export type { ItemCardProps };
