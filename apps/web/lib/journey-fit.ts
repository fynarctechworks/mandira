/**
 * "Fits your journey" (PRD-DISC-006, A03).
 *
 * With a journey under way or ahead, search puts first what could actually go into it: at
 * that journey's destination and running on at least one of its days. Pure, so the rule is
 * tested once and the search only supplies the facts.
 *
 * Ranking, never filtering: nothing a traveler searched for disappears because it does not
 * fit, and the order within each group is the editorial order search already had.
 */

export type JourneyToFit = {
  id: string;
  destinationId: string;
  dates: string[];
};

type JourneyLike = {
  id: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  destinationId: string | null;
};

/** The longest span searched against, so a mistyped end date cannot make every lookup huge. */
const MAX_DAYS = 14;

/**
 * The journey a search should fit: the one under way, otherwise the soonest one ahead. Only a
 * journey with a destination and a start date can be fitted to at all.
 */
export function pickJourneyToFit(journeys: JourneyLike[], today: string): JourneyToFit | null {
  const usable = journeys.filter(
    (journey): journey is JourneyLike & { destinationId: string; startDate: string } =>
      !!journey.destinationId && !!journey.startDate,
  );

  const active = usable.find((journey) => journey.status === "active");
  const ahead = usable
    .filter(
      (journey) =>
        (journey.status === "upcoming" || journey.status === "draft") &&
        (journey.endDate ?? journey.startDate) >= today,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  const chosen = active ?? ahead;
  if (!chosen) return null;

  return {
    id: chosen.id,
    destinationId: chosen.destinationId,
    dates: datesBetween(chosen.startDate, chosen.endDate),
  };
}

/** Every calendar date from start to end inclusive, capped at MAX_DAYS. */
export function datesBetween(startDate: string, endDate: string | null): string[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = endDate ? Date.parse(`${endDate}T00:00:00Z`) : start;
  if (Number.isNaN(start)) return [];

  const dates: string[] = [];
  for (let at = start; at <= Math.max(start, end) && dates.length < MAX_DAYS; at += 86_400_000) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }
  return dates;
}

/** Fitting results first, each group keeping the order it came in; every result tagged. */
export function rankByJourneyFit<T extends object>(
  results: T[],
  fits: (result: T) => boolean,
): (T & { fitsJourney: boolean })[] {
  const tagged = results.map((result) => ({ ...result, fitsJourney: fits(result) }));
  return [
    ...tagged.filter((result) => result.fitsJourney),
    ...tagged.filter((result) => !result.fitsJourney),
  ];
}
