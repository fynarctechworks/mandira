import type { SearchFilters } from "./knowledge";

/**
 * The search query string, as the GET form and `/api/search` both send it (PRD F2, A03).
 *
 * Pure, so the page and the route read a query identically: anything that is not a value the
 * filter bar offers is ignored rather than passed through to a query.
 */
export type SearchQuery = {
  q?: string | undefined;
  type?: string | undefined;
  access?: string | undefined;
  duration?: string | undefined;
  booking?: string | undefined;
  on?: string | undefined;
  near?: string | undefined;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function searchFiltersFrom(query: SearchQuery): SearchFilters {
  const duration = Number(query.duration);

  return {
    ...(query.type ? { type: query.type } : {}),
    ...(query.access === "step_free" ? { stepFreeOnly: true } : {}),
    ...(Number.isFinite(duration) && duration > 0 ? { maxDurationMinutes: duration } : {}),
    ...(query.booking === "yes"
      ? { advanceBooking: true }
      : query.booking === "no"
        ? { advanceBooking: false }
        : {}),
    ...(query.on && isRealDate(query.on) ? { availableOn: query.on } : {}),
    ...(query.near && UUID.test(query.near) ? { nearJourneyId: query.near } : {}),
  };
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
