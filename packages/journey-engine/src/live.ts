import { computeHealth, type HealthState } from "./health";
import { travelMinutes } from "./schedule";
import { dateForDay, fromInstant, toInstant, toMinutes } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle } from "./types";

/**
 * What the traveler is doing, or on their way to doing.
 *
 * `travel` is a state, not an item: PRD F8 says that between two items NOW shows the
 * travel leg as the current focus, and D-061 keeps legs computed rather than materialised.
 */
export type LiveKind = "item" | "travel" | "free" | "before_day" | "day_complete";

export type LiveCard = {
  kind: LiveKind;
  itemId: string | null;
  /** The place to be, when there is one. */
  placeId: string | null;
  startAt: string | null;
  endAt: string | null;
  /** Minutes until it starts; negative once it has. Null when there is no time to give. */
  inMinutes: number | null;
  /** Travel to reach it, when this card is a leg or is preceded by one. */
  travelMinutes?: number;
};

export type LaterRow = {
  itemId: string;
  tier: JourneyItem["tier"];
  startAt: string | null;
  endAt: string | null;
};

export type LiveProjection = {
  now: LiveCard;
  next: LiveCard | null;
  later: LaterRow[];
  dayIndex: number;
  dayState: HealthState;
  /** When to leave in order to reach NEXT on time (PRD F8's departure-by). */
  leaveByAt: string | null;
};

/**
 * The Live Journey projection (PRD F8, TRD §5.1 `getNowNextLater`).
 *
 * Reduces the whole plan to what a traveler standing somewhere actually needs: what am I
 * doing, when do I leave, what is after that. Everything else on the day is the LATER list
 * and nothing else is returned at all — PRD F8 forbids a calendar grid inside Live mode,
 * and an API that hands the UI the whole week invites one.
 *
 * `nowAt` is a parameter, never `Date.now()`. The engine has no clock (D-005), which is
 * what lets the same projection be computed on a server, in a worker, and on a phone in
 * airplane mode and agree every time.
 */
export function getNowNextLater(input: {
  journey: Journey;
  items: JourneyItem[];
  knowledge: KnowledgeBundle;
  nowAt: string;
  /** Defaults to the day `nowAt` falls on. */
  dayIndex?: number;
}): LiveProjection {
  const { journey, items, knowledge, nowAt } = input;

  const dayIndex = input.dayIndex ?? dayIndexOf(nowAt, journey);
  const date = dateForDay(journey.start_date, dayIndex);
  const nowMinutes = fromInstant(nowAt, date, journey.timezone);

  const day = items
    .filter((i) => i.day_index === dayIndex)
    .sort((a, b) => a.sort_order - b.sort_order);

  const health = computeHealth({ journey, items, knowledge });
  const dayState = health.days.find((d) => d.dayIndex === dayIndex)?.state ?? "comfortable";

  const timed = day.filter((i) => i.planned_start_at && i.planned_end_at);

  const current = timed.find(
    (i) =>
      minutesOf(i.planned_start_at!, date, journey) <= nowMinutes &&
      nowMinutes < minutesOf(i.planned_end_at!, date, journey),
  );

  const upcoming = timed.filter((i) => minutesOf(i.planned_start_at!, date, journey) > nowMinutes);
  const upNext = upcoming[0];

  const now = currentCard({ current, upNext, day, date, journey, knowledge, nowMinutes });
  const next = upNext && upNext !== current ? itemCard(upNext, date, journey, nowMinutes) : null;

  const leg = current && upNext ? travelMinutes(current, upNext, knowledge) : 0;

  return {
    now,
    next,
    later: upcoming.slice(next ? 1 : 0).map((i) => ({
      itemId: i.id,
      tier: i.tier,
      startAt: i.planned_start_at ?? null,
      endAt: i.planned_end_at ?? null,
    })),
    dayIndex,
    dayState,
    leaveByAt: upNext ? leaveBy(upNext, leg, date, journey) : null,
  };
}

function currentCard(input: {
  current: JourneyItem | undefined;
  upNext: JourneyItem | undefined;
  day: JourneyItem[];
  date: string;
  journey: Journey;
  knowledge: KnowledgeBundle;
  nowMinutes: number;
}): LiveCard {
  const { current, upNext, day, date, journey, knowledge, nowMinutes } = input;

  if (current) {
    const card = itemCard(current, date, journey, nowMinutes);
    // A rest or free-time block is not a task. PRD F8 shows "nothing you need to do right
    // now" for these, and calling them an item would put a job where there isn't one.
    return current.item_type === "free_time" || current.item_type === "rest"
      ? { ...card, kind: "free" }
      : card;
  }

  if (!upNext) {
    return day.length > 0 && nowMinutes >= toMinutes(journey.day_start_time)
      ? empty("day_complete")
      : empty("before_day");
  }

  const previous = [...day]
    .filter((i) => i.planned_end_at && minutesOf(i.planned_end_at, date, journey) <= nowMinutes)
    .pop();

  // Between two items with somewhere to get to: the leg IS the current focus (PRD F8).
  if (previous) {
    const leg = travelMinutes(previous, upNext, knowledge);
    return {
      kind: leg > 0 ? "travel" : "free",
      itemId: upNext.id,
      placeId: upNext.place_id ?? null,
      startAt: previous.planned_end_at ?? null,
      endAt: upNext.planned_start_at ?? null,
      inMinutes: minutesOf(upNext.planned_start_at!, date, journey) - nowMinutes,
      ...(leg > 0 ? { travelMinutes: leg } : {}),
    };
  }

  return empty("before_day");
}

function itemCard(item: JourneyItem, date: string, journey: Journey, nowMinutes: number): LiveCard {
  return {
    kind: "item",
    itemId: item.id,
    placeId: item.place_id ?? null,
    startAt: item.planned_start_at ?? null,
    endAt: item.planned_end_at ?? null,
    inMinutes: item.planned_start_at
      ? minutesOf(item.planned_start_at, date, journey) - nowMinutes
      : null,
  };
}

/**
 * Departure-by for the next item.
 *
 * Its own buffer is included: the buffer exists precisely to cover getting somewhere and
 * settling in, and a leave-by that spends it is a leave-by that arrives exactly on time
 * with nothing left over, which is not what "leave by" means to anyone standing in a queue.
 */
function leaveBy(
  next: JourneyItem,
  legMinutes: number,
  date: string,
  journey: Journey,
): string | null {
  if (!next.planned_start_at) return null;

  const start = minutesOf(next.planned_start_at, date, journey);
  return toInstant(date, start - legMinutes - (next.buffer_minutes ?? 0), journey.timezone);
}

function empty(kind: LiveKind): LiveCard {
  return { kind, itemId: null, placeId: null, startAt: null, endAt: null, inMinutes: null };
}

function minutesOf(instant: string, date: string, journey: Journey): number {
  return fromInstant(instant, date, journey.timezone);
}

/** Which day of the journey an instant falls on, clamped to the journey's own days. */
function dayIndexOf(instant: string, journey: Journey): number {
  const minutes = fromInstant(instant, journey.start_date, journey.timezone);
  return Math.max(0, Math.floor(minutes / 1440));
}
