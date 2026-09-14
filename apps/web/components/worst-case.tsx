import { HealthPill } from "@mandhira/ui";
import type { HealthReport } from "@mandhira/journey-engine";
import { useTranslations } from "next-intl";

const ORDER = ["comfortable", "tight", "at_risk", "broken"] as const;

/**
 * The worst-case preview (PRD-HLTH-004).
 *
 * Health is judged on likely durations; this says which days would get harder if everything
 * took its longest recorded time, and says so plainly when none would. States only, never a
 * number (PRD F5), and only the days that change — repeating an unchanged verdict for every
 * day would bury the one worth reading.
 */
export function WorstCase({
  likely,
  worst,
  dayLabel,
}: {
  likely: HealthReport;
  worst: HealthReport;
  dayLabel: (dayIndex: number) => string;
}) {
  const t = useTranslations("worstCase");
  const harder = worst.days.filter((day) => {
    const planned = likely.days.find((d) => d.dayIndex === day.dayIndex);
    return planned && ORDER.indexOf(day.state) > ORDER.indexOf(planned.state);
  });

  return (
    <section
      aria-labelledby="worst-case"
      className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-4"
    >
      <h2 id="worst-case" className="text-h3">
        {t("title")}
      </h2>
      {harder.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t("still_fits")}</p>
      ) : (
        <>
          <p className="text-body-sm text-text-secondary">{t("intro")}</p>
          <ul className="flex flex-col gap-2">
            {harder.map((day) => (
              <li key={day.dayIndex} className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-medium">{dayLabel(day.dayIndex)}</span>
                <HealthPill state={day.state} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
