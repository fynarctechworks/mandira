import { HealthPill, ItemCard } from "@mandhira/ui";
import type { DayHealth, Journey, JourneyItem } from "@mandhira/journey-engine";
import { dateForDay, fromInstant } from "@mandhira/journey-engine";
import { useTranslations } from "next-intl";

import { durationLabel } from "../lib/present";
import { causeText, trustText } from "./journey-health";

const TIER_LABELS = {
  fixed: "FIXED",
  protected: "PROTECTED",
  important: "IMPORTANT",
  optional: "OPTIONAL",
} as const;

/**
 * One day of the proposed journey (PRD F4's Day view).
 *
 * Each item shows its tier, its time, how long it takes and the travel to reach it. The
 * tier chip is not decoration: it is the traveler's own statement of what matters, and it
 * is what the engine will and will not touch when a day stops working.
 *
 * The day's health sits at the top with its causes listed underneath, because PRD F5
 * requires every non-Comfortable state to name at least one concrete reason. A pill
 * without a reason is a mood, not information.
 */
export function DayPlan({
  dayIndex,
  journey,
  items,
  health,
  nameOf,
  locale,
}: {
  dayIndex: number;
  journey: Journey;
  items: JourneyItem[];
  health: DayHealth | undefined;
  nameOf: Map<string, string>;
  locale: string;
}) {
  const t = useTranslations();
  const tPresent = useTranslations("present");
  const date = dateForDay(journey.start_date, dayIndex);
  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order);

  /*
   * Deduplicated by the sentence they produce. The engine raises a cause per ITEM, so two
   * experiences at the same partly step-free place produce the same sentence twice — which
   * is noise, and would also collide as React keys. The item ids stay in the data for when
   * this list can point at a specific item.
   */
  const causes = [...new Set((health?.causes ?? []).map((c) => causeText(t, c)).filter(Boolean))];
  const trust = [
    ...new Set((health?.trustExposure ?? []).map((c) => trustText(t, c)).filter(Boolean)),
  ];

  return (
    <section aria-labelledby={`day-${dayIndex}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`day-${dayIndex}`} className="text-h2">
          {new Intl.DateTimeFormat(locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date(`${date}T00:00:00Z`))}
        </h2>
        {health ? <HealthPill state={health.state} /> : null}
      </div>

      {causes.length > 0 || trust.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-lg border border-border bg-bg-surface p-3">
          {causes.map((text) => (
            <li key={text} className="text-body-sm">
              {text}
            </li>
          ))}
          {/*
           * Trust exposure is its own line, not folded into the causes. Unverified
           * information is a different kind of problem from a day that will not fit, and
           * running them together would make a comfortable-but-unverified day read exactly
           * like a comfortable, verified one (PRD F5).
           */}
          {trust.map((text) => (
            <li key={text} className="text-body-sm text-text-secondary">
              {text}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        {ordered.map((item) => {
          const duration = durationLabel(item.duration_likely_minutes ?? null, tPresent);
          return (
            <ItemCard
              key={item.id}
              time={clock(item.planned_start_at, date, journey.timezone, locale)}
              title={titleOf(item, nameOf, t)}
              // Omitted rather than passed as undefined: the workspace runs with
              // exactOptionalPropertyTypes, under which those are not the same thing.
              {...(duration ? { duration } : {})}
              tier={TIER_LABELS[item.tier]}
            />
          );
        })}
      </div>
    </section>
  );
}

/** An item's own name, or an honest label for something with no experience behind it. */
function titleOf(
  item: JourneyItem,
  nameOf: Map<string, string>,
  t: (key: string) => string,
): string {
  if (item.experience_id) {
    return nameOf.get(item.experience_id) ?? t("common.something_you_added");
  }
  if (item.item_type === "fixed_commitment") return t("dayPlan.fixed_commitment");
  if (item.item_type === "rest") return t("dayPlan.rest");
  if (item.item_type === "meal") return t("dayPlan.meal");
  return t("common.free_time");
}

/**
 * The local wall time, or nothing.
 *
 * An item the engine could not place has no time, and it is shown WITHOUT one rather than
 * with a guess. A plausible-looking time on something that could not be scheduled is the
 * single most misleading thing this screen could do.
 */
function clock(
  instant: string | null | undefined,
  date: string,
  timeZone: string,
  locale: string,
): string {
  if (!instant) return "";

  const minutes = fromInstant(instant, date, timeZone);
  const hours = Math.floor((((minutes % 1440) + 1440) % 1440) / 60);
  const mins = (((minutes % 1440) + 1440) % 1440) % 60;

  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hours, mins)));
}
