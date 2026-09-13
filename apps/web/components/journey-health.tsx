import { HealthPill } from "@mandhira/ui";
import type { Cause, HealthReport, TrustCause } from "@mandhira/journey-engine";
import { useTranslations } from "next-intl";

import { engineText, type Translate } from "../lib/engine-text";

/**
 * Journey Health (PRD F5).
 *
 * The engine returns i18n keys and parameters, never sentences; they become language here,
 * from the message catalogs. PRD F5 forbids a numeric score — the state and its causes are
 * the whole output.
 */
export function causeText(t: Translate, cause: Cause): string {
  return engineText(t, cause.key, cause.params);
}

export function trustText(t: Translate, cause: TrustCause): string {
  return engineText(t, cause.key, { count: cause.count });
}

/** The journey-level state, which PRD F5 defines as its worst day. */
export function JourneyHealth({ report }: { report: HealthReport }) {
  const t = useTranslations();

  return (
    <section aria-labelledby="health" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="health" className="text-h2">
          {t("health.title")}
        </h2>
        <HealthPill state={report.journeyState} />
      </div>
      <p className="text-body-sm text-text-secondary" aria-live="polite">
        {t(`health.state.${report.journeyState}`)}
      </p>
    </section>
  );
}
