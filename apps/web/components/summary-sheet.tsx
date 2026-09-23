import { dateForDay, fromInstant } from "@mandhira/journey-engine";
import { TierChip } from "@mandhira/ui";

import type { SharedItem, SharedSummary } from "../lib/share";
import { useTranslations } from "next-intl";

import { durationLabel, type PlainTranslate } from "../lib/present";

/**
 * The Journey Summary (PRD-PREP-004) — day-by-day, read-only, printable.
 *
 * One component behind both the traveler's own `/summary` and the public `/s/<token>`
 * page, so what a shared link shows is the same thing the owner previewed. Two renderers
 * would drift, and the direction they drift in is a shared page showing more than the
 * owner expected.
 *
 * It takes the SQL projection's shape (`SharedSummary`) rather than the full journey on
 * purpose: this component cannot render a traveler profile or an item note because it is
 * never handed one.
 */
/** `priority_tier_enum` → the TierChip keyword (the same map the journey page uses). */
const TIER_CHIP = {
  fixed: "FIXED",
  protected: "PROTECTED",
  important: "IMPORTANT",
  optional: "OPTIONAL",
} as const;

export function SummarySheet({ summary, locale }: { summary: SharedSummary; locale: string }) {
  const t = useTranslations();
  const tPresent = useTranslations("present");
  const { journey, items, facilities } = summary;
  const start = journey.startDate ?? new Date().toISOString().slice(0, 10);
  const dayIndexes = [...new Set(items.map((i) => i.dayIndex))].sort((a, b) => a - b);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-display">{journey.title ?? t("addToJourney.untitled")}</h1>
        {journey.startDate ? (
          <p className="text-body-sm text-text-secondary">
            {formatDay(journey.startDate, locale)}
            {journey.endDate && journey.endDate !== journey.startDate
              ? ` — ${formatDay(journey.endDate, locale)}`
              : ""}
          </p>
        ) : null}
      </header>

      {dayIndexes.length === 0 ? (
        <p className="text-body text-text-secondary">{t("summarySheet.empty")}</p>
      ) : null}

      {dayIndexes.map((dayIndex) => {
        const dayItems = items
          .filter((i) => i.dayIndex === dayIndex)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        const date = dateForDay(start, dayIndex);
        const requirements = requirementsFor(dayItems, t);

        return (
          <section key={dayIndex} className="summary-day flex flex-col gap-3">
            <h2 className="text-h2">{formatDay(date, locale)}</h2>

            {/*
             * PRD F7: the summary carries the REQUIREMENTS, not just the times — this is
             * the page someone reads at the gate.
             *
             * Once per DAY, not once per item. Several stops at the same temple all say
             * "carry photo ID", and repeating it under every entry pushed a full day onto
             * a second and third sheet — which breaks the one-A4-per-day criterion for
             * exactly the busy days that most need to fit. Still repeated across days,
             * deliberately: each sheet is read on its own, and "see yesterday" is no use
             * to whoever is holding today.
             */}
            {requirements.length > 0 ? (
              <ul className="summary-entry flex flex-col gap-0.5 border-y border-border-subtle py-2">
                {requirements.map((line) => (
                  <li key={line} className="text-body-sm">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}

            <ol className="flex flex-col gap-3">
              {dayItems.map((item) => (
                <li
                  key={item.id}
                  className="summary-entry flex flex-col gap-1 border-b border-border-subtle pb-3 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-h3">{item.label ?? t("common.something_you_added")}</h3>
                    {/*
                      The shared chip, not a third style of its own (design review): icon,
                      word and the traveler's language on screen, like everywhere else.
                      `summary-tier` still turns it black-on-white when printed, so the
                      tier survives a monochrome printer by its word and icon.
                    */}
                    <TierChip
                      tier={TIER_CHIP[item.tier]}
                      label={t(`itemActions.tiers.${item.tier}.label`)}
                      readOnly
                      className="summary-tier shrink-0"
                    />
                  </div>

                  <p className="text-body-sm text-text-secondary">
                    {timing(item, date, journey.timezone, locale, t, tPresent)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      {facilities.length > 0 ? (
        <section className="summary-entry flex flex-col gap-2">
          <h2 className="text-h2">{t("summarySheet.facilities_title")}</h2>
          <ul className="flex flex-col gap-1">
            {facilities.map((facility) => (
              <li key={facility.id} className="text-body-sm">
                <span className="font-medium">{facility.name}</span>
                {facility.address ? ` — ${facility.address}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

/**
 * The distinct entry requirements and dress codes across one day.
 *
 * Deduplicated by the sentence itself rather than by place id: two different temples with
 * the same rule should say it once, and a traveler does not care which of them it came
 * from — they care what to put in their bag.
 */
function requirementsFor(dayItems: SharedItem[], t: PlainTranslate): string[] {
  const lines = new Set<string>();

  for (const item of dayItems) {
    if (item.entryRequirements) {
      lines.add(t("summarySheet.to_get_in", { text: item.entryRequirements }));
    }
    if (item.dressCode) lines.add(t("summarySheet.what_to_wear", { text: item.dressCode }));
  }

  return [...lines];
}

/** "6:00 AM — 7:30 AM · 1 h 30 m", or an honest "Not scheduled". */
function timing(
  item: SharedItem,
  date: string,
  timeZone: string,
  locale: string,
  t: PlainTranslate,
  tPresent: PlainTranslate,
): string {
  const duration = durationLabel(item.durationLikelyMinutes, tPresent);
  const unscheduled = t("common.not_scheduled");

  if (!item.plannedStartAt) {
    return duration ? `${unscheduled} · ${duration}` : unscheduled;
  }

  const from = clock(item.plannedStartAt, date, timeZone, locale);
  const to = item.plannedEndAt ? clock(item.plannedEndAt, date, timeZone, locale) : null;

  return [to ? `${from} — ${to}` : from, duration].filter(Boolean).join(" · ");
}

function clock(instant: string, date: string, timeZone: string, locale: string): string {
  const minutes = fromInstant(instant, date, timeZone);
  const inDay = ((minutes % 1440) + 1440) % 1440;

  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(inDay / 60), inDay % 60)));
}

function formatDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}
