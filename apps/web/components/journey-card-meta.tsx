import { HealthPill } from "@mandhira/ui";

import type { JourneySummary } from "../lib/journey-summary";

/**
 * The three lines under a journey card's title: where, when, and how it stands.
 *
 * Health only for journeys still ahead or under way. A finished journey's verdict answers
 * a question nobody is asking any more, and "Tight" beside a pilgrimage completed last
 * spring reads like a warning about something that already went fine.
 *
 * The pill carries its own icon and word (PRD §12.8), so the state is never colour alone.
 */
export function JourneyCardMeta({
  summary,
  showHealth,
  noDateLabel,
}: {
  summary: JourneySummary | undefined;
  showHealth: boolean;
  noDateLabel: string;
}) {
  return (
    <>
      {summary?.destination ? (
        <span className="truncate text-body-sm text-text-secondary">{summary.destination}</span>
      ) : null}
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-text-secondary">{summary?.dates ?? noDateLabel}</span>
        {showHealth && summary?.health ? <HealthPill state={summary.health} /> : null}
      </span>
    </>
  );
}
