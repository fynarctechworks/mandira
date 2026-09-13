import type { ExtractedBrief } from "@mandhira/providers";

/**
 * The confirmed brief → the preview and structured-form URLs (PRD F3, A08 → F4).
 *
 * The preview reads its brief from the URL (D-089/D-093), so the review screen's last job is
 * to write one. Kept pure and apart from the screen, because the two rules in here decide what
 * the plan protects: whose mobility the day is built around, and which moment is the way home.
 */

export type Mobility = NonNullable<ExtractedBrief["travelers"][number]["mobility"]>;
export type Pace = "relaxed" | "balanced" | "full";

/** Most constrained first: the engine plans to the strictest need in the group (PRD-PLAN-005). */
const STRICTNESS: Mobility[] = ["wheelchair", "limited_walking", "needs_rest_frequently", "full"];

export function strictestMobility(travelers: ExtractedBrief["travelers"]): Mobility {
  return STRICTNESS.find((need) => travelers.some((t) => t.mobility === need)) ?? "full";
}

/**
 * A commitment's time as the `datetime-local` value the preview takes ("2026-10-16T18:00").
 *
 * A time written without an offset is kept as written — it is the traveler's own clock. An
 * instant with an offset is read in the journey's timezone. Anything else is null: a return
 * guard built on a guessed time would protect the wrong moment.
 */
export function toLocalDateTime(at: string | undefined, timeZone = "Asia/Kolkata"): string | null {
  if (!at) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(at)) return at.slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([zZ]|[+-]\d{2}:?\d{2})$/.test(at))
    return null;

  const instant = new Date(at);
  if (Number.isNaN(instant.getTime())) return null;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}`;
}

export type ConfirmedBrief = {
  destinationSlug: string;
  startDate: string;
  dayCount: number;
  pace?: Pace;
  mobility: Mobility;
  mustDo: string[];
  wouldLike: string[];
  /** The one commitment the traveler chose as their way home, as a local date-time. */
  returnAt?: string | null;
};

export function previewHref(locale: string, brief: ConfirmedBrief): string {
  const query = new URLSearchParams();
  query.set("destination", brief.destinationSlug);
  query.set("start", brief.startDate);
  query.set("days", String(brief.dayCount));
  if (brief.pace) query.set("pace", brief.pace);
  query.set("mobility", brief.mobility);
  appendPicks(query, brief.mustDo, brief.wouldLike);
  if (brief.returnAt) query.set("return", brief.returnAt);
  return `/${locale}/plan/preview?${query.toString()}`;
}

/**
 * The structured questions, prefilled with whatever is already known.
 *
 * Never a start date — the form deliberately takes none as a default (PRD Principle 1).
 */
export function structuredFormHref(
  locale: string,
  prefill: Partial<Omit<ConfirmedBrief, "startDate" | "returnAt">> = {},
): string {
  const query = new URLSearchParams();
  if (prefill.destinationSlug) query.set("destination", prefill.destinationSlug);
  if (prefill.dayCount) query.set("days", String(prefill.dayCount));
  if (prefill.pace) query.set("pace", prefill.pace);
  if (prefill.mobility) query.set("mobility", prefill.mobility);
  appendPicks(query, prefill.mustDo ?? [], prefill.wouldLike ?? []);

  const search = query.toString();
  return `/${locale}/plan${search ? `?${search}` : ""}`;
}

/** Must-do wins: an experience named both ways is something the traveler has to do. */
function appendPicks(query: URLSearchParams, mustDo: string[], wouldLike: string[]): void {
  const must = new Set(mustDo);
  for (const id of must) query.append("must", id);
  for (const id of new Set(wouldLike)) if (!must.has(id)) query.append("like", id);
}
