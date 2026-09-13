import { checkReturnGuard, type ReturnGuardResult } from "./return-guard";
import { resolveAvailability } from "./availability";
import { travelMinutes } from "./schedule";
import { dateForDay, fromInstant, toMinutes, toTimeOfDay } from "./time";
import type {
  Journey,
  JourneyItem,
  JourneyItemDependency,
  KnowledgeBundle,
  StepFree,
  TravelerProfile,
} from "./types";

export type HealthState = "comfortable" | "tight" | "at_risk" | "broken";

/**
 * A cause is an i18n KEY plus parameters, never a rendered sentence.
 *
 * The engine runs in a Web Worker, on a server, and offline; none of those places knows
 * the traveler's language. Returning "Walking is about 3.1 km" would hardcode English into
 * the one part of the system that must stay language-neutral (TRD §11.2 Day 12).
 */
export type Cause = {
  key: string;
  params?: Record<string, string | number>;
  /** Which of PRD F5's five checks raised it. */
  check: "time_load" | "availability" | "dependency" | "physical_load" | "return_guard";
  itemId?: string;
};

export type TrustCause = { key: string; params?: Record<string, string | number>; count: number };

export type DayHealth = {
  dayIndex: number;
  state: HealthState;
  /** Time load as a percentage of the tightest usable window in the day. */
  timeLoadPct: number;
  causes: Cause[];
  trustExposure: TrustCause[];
};

export type HealthReport = {
  journeyState: HealthState;
  days: DayHealth[];
};

/**
 * PRD-HLTH-005 physical-load defaults, applied for the most constrained traveler.
 *
 * A wheelchair user is deliberately absent from the distance table: their constraint is
 * step-free access, not metres, and giving them a distance limit instead would report a
 * comfortable day for a route with a flight of steps in it.
 */
const WALKING_LIMIT_METRES: Partial<Record<TravelerProfile["mobility"], number>> = {
  limited_walking: 2000,
};

/** What each recorded step-free answer means for someone using a wheelchair. */
const STEP_FREE_CAUSE: Record<StepFree | "unknown", string | null> = {
  yes: null,
  no: "health.cause.not_step_free",
  partial: "health.cause.partly_step_free",
  unknown: "health.cause.step_free_unknown",
};

/** The longest stretch of activity before someone who tires needs a break, in minutes. */
const REST_INTERVAL_MINUTES = 90;
/** What counts as a break rather than a pause between two things. */
const REST_MINIMUM_MINUTES = 10;

/** A guard against a malformed end date turning one report into thousands of empty days. */
const MAX_REPORTED_DAYS = 60;

const STATE_ORDER: HealthState[] = ["comfortable", "tight", "at_risk", "broken"];

/**
 * Journey Health (PRD F5, TRD §5.1 `computeHealth`).
 *
 * Runs all five checks per day and reduces them to one of four states, with concrete
 * causes. It NEVER returns a numeric score to display — PRD F5 is explicit that travelers
 * see a state and its reasons, not a number they would have to interpret.
 *
 * Uses LIKELY durations. Max durations are for a separate worst-case preview; planning
 * against them would make every reasonable day look broken.
 */
export function computeHealth(input: {
  journey: Journey;
  items: JourneyItem[];
  knowledge: KnowledgeBundle;
  travelers?: TravelerProfile[];
  dependencies?: JourneyItemDependency[];
}): HealthReport {
  const { journey, items, knowledge } = input;
  const travelers = input.travelers ?? [];
  const dependencies = input.dependencies ?? [];

  // Every day of the journey is reported, including one with nothing planned yet: a
  // three-day journey whose report lists two days reads as a two-day journey.
  const dayIndexes = [
    ...new Set([
      ...Array.from({ length: journeyDayCount(journey) }, (_, index) => index),
      ...items.map((i) => i.day_index),
    ]),
  ].sort((a, b) => a - b);

  /*
   * The return guard is one question about the whole journey, so it is asked once — and
   * its answer belongs to the day that holds the anchor. A train missed on day 3 does not
   * make day 1 unworkable, and saying it does sends the traveler to fix the wrong day.
   */
  const guard = checkReturnGuard({ journey, items, knowledge });
  const guardDay = guard.anchorItemId
    ? (items.find((i) => i.id === guard.anchorItemId)?.day_index ?? null)
    : null;

  const days = dayIndexes.map((dayIndex) =>
    computeDayHealth({
      journey,
      dayIndex,
      items: items.filter((i) => i.day_index === dayIndex),
      knowledge,
      travelers,
      dependencies,
      guard: dayIndex === guardDay ? guard : null,
      returnAnchorId: guard.anchorItemId,
    }),
  );

  // The journey is only as sound as its worst day: a single broken day is not averaged
  // away by six comfortable ones.
  const journeyState = days.reduce<HealthState>(
    (worst, day) =>
      STATE_ORDER.indexOf(day.state) > STATE_ORDER.indexOf(worst) ? day.state : worst,
    "comfortable",
  );

  return { journeyState, days };
}

function computeDayHealth(input: {
  journey: Journey;
  dayIndex: number;
  items: JourneyItem[];
  knowledge: KnowledgeBundle;
  travelers: TravelerProfile[];
  dependencies: JourneyItemDependency[];
  guard: ReturnGuardResult | null;
  returnAnchorId: string | null;
}): DayHealth {
  const { journey, dayIndex, items, knowledge, travelers, dependencies, guard } = input;
  const date = dateForDay(journey.start_date, dayIndex);
  const causes: Cause[] = [];

  const dayStart = toMinutes(journey.day_start_time);
  const dayEnd = toMinutes(journey.day_end_time);
  const windowMinutes = dayEnd - dayStart;

  // ── 1. Time load ────────────────────────────────────────────────────────────
  //
  // PRD F5 measures load against "day start → day end, or → the next FIXED item". A FIXED
  // item splits the day: what comes before it has to fit before it, and room after the
  // train does not help a morning that cannot reach the station. So each stretch between
  // anchors is judged on its own window, and the tightest one sets the day's load.
  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order);

  let load = 0;
  let segmentStart = dayStart;
  let segmentLoad = 0;
  let worstRatio = 0;
  let fixedUnreachable = false;

  ordered.forEach((item, index) => {
    const lead =
      index > 0
        ? travelMinutes(ordered[index - 1]!, item, knowledge) + (item.buffer_minutes ?? 0)
        : 0;
    const duration = loadDuration(item);
    load += lead + duration;

    if (item.tier !== "fixed" || !item.fixed_start_at) {
      segmentLoad += lead + duration;
      return;
    }

    const anchor = fromInstant(item.fixed_start_at, date, journey.timezone);
    const available = Math.max(0, anchor - segmentStart);
    const needed = segmentLoad + lead;
    if (available > 0) worstRatio = Math.max(worstRatio, needed / available);

    const shortBy = needed - available;
    // The journey's return anchor is the return guard's to report; saying it twice is noise.
    if (shortBy > 0 && item.id !== input.returnAnchorId) {
      causes.push({
        check: "time_load",
        key: "health.cause.fixed_unreachable",
        params: { minutes: shortBy },
        itemId: item.id,
      });
      fixedUnreachable = true;
    }

    segmentStart = Math.max(segmentStart, anchor + duration);
    segmentLoad = 0;
  });

  const tailWindow = Math.max(0, dayEnd - segmentStart);
  if (windowMinutes > 0) worstRatio = Math.max(worstRatio, load / windowMinutes);
  if (tailWindow > 0) worstRatio = Math.max(worstRatio, segmentLoad / tailWindow);

  const overrunMinutes = Math.max(0, load - windowMinutes, segmentLoad - tailWindow);

  // Rounded for display only. The state is decided on the unrounded value, so 80.4% is
  // Tight rather than quietly rounding down into Comfortable.
  const timeLoadExact = worstRatio * 100;
  const timeLoadPct = Math.round(timeLoadExact);

  if (overrunMinutes > 0) {
    causes.push({
      check: "time_load",
      key: "health.cause.day_overruns",
      params: { minutes: overrunMinutes },
    });
  }

  // ── 2. Availability fit ─────────────────────────────────────────────────────
  //
  // The whole visit must fit inside one window, not just its first minute: arriving five
  // minutes before closing is not a visit.
  let protectedInfeasible = false;
  let lesserInfeasible = false;

  for (const item of ordered) {
    if (!item.experience_id || !item.planned_start_at) continue;

    const rules = knowledge.availability_rules.filter(
      (r) => r.experience_id === item.experience_id,
    );
    if (rules.length === 0) continue;

    const experience = knowledge.experiences.find((e) => e.id === item.experience_id);
    const place = experience?.place_id
      ? knowledge.places.find((p) => p.id === experience.place_id)
      : undefined;

    const startMinutes = fromInstant(item.planned_start_at, date, journey.timezone);
    const endMinutes = item.planned_end_at
      ? fromInstant(item.planned_end_at, date, journey.timezone)
      : startMinutes + (item.duration_likely_minutes ?? 0);
    const at = toTimeOfDay(startMinutes);

    const availability = resolveAvailability({
      rules,
      date,
      ...(place?.opening_schedule ? { openingSchedule: place.opening_schedule } : {}),
    });

    const window = (availability.available ? availability.windows : []).find(
      (w) => startMinutes >= toMinutes(w.start) && startMinutes < toMinutes(w.end),
    );

    let problem: Cause | null = null;
    if (!window) {
      problem = {
        check: "availability",
        key: "health.cause.outside_availability",
        params: { at },
        itemId: item.id,
      };
    } else if (endMinutes > toMinutes(window.end)) {
      problem = {
        check: "availability",
        key: "health.cause.runs_past_availability",
        params: { at, closes: window.end },
        itemId: item.id,
      };
    }

    if (problem) {
      causes.push(problem);
      if (item.tier === "protected" || item.tier === "fixed") protectedInfeasible = true;
      else lesserInfeasible = true;
    }
  }

  // ── 3. Dependency fit ───────────────────────────────────────────────────────
  const startOf = new Map(
    ordered
      .filter((i) => i.planned_start_at)
      .map((i) => [i.id, fromInstant(i.planned_start_at!, date, journey.timezone)]),
  );

  for (const dep of dependencies) {
    const after = startOf.get(dep.after_item_id);
    const item = startOf.get(dep.item_id);
    if (after === undefined || item === undefined) continue;

    if (item < after) {
      causes.push({
        check: "dependency",
        key: "health.cause.dependency_broken",
        itemId: dep.item_id,
      });
      lesserInfeasible = true;
    }
  }

  // ── 4. Physical load (PRD-HLTH-005) ─────────────────────────────────────────
  const physical = physicalLoad(ordered, knowledge, travelers);
  causes.push(...physical);
  const physicalWarning = physical.length > 0;

  // ── 5. Trust exposure ───────────────────────────────────────────────────────
  const trustExposure = trustExposureFor(ordered, knowledge);

  // ── Return guard, on the anchor's own day ───────────────────────────────────
  const returnBreached = guard !== null && !guard.ok;
  if (returnBreached) {
    causes.push({
      check: "return_guard",
      key: "health.cause.return_guard_breached",
      params: { minutes: guard.breachMinutes },
      ...(guard.anchorItemId ? { itemId: guard.anchorItemId } : {}),
    });
  }

  const state = decideState({
    timeLoadPct: timeLoadExact,
    overrunMinutes,
    protectedInfeasible: protectedInfeasible || fixedUnreachable,
    lesserInfeasible,
    physicalWarning,
    returnBreached,
  });

  return { dayIndex, state, timeLoadPct, causes, trustExposure };
}

/**
 * PRD F5's state table, in order of severity.
 *
 * Broken is checked first and wins outright: a breached return or an infeasible PROTECTED
 * item is not softened by an otherwise comfortable time load.
 */
export function decideState(input: {
  timeLoadPct: number;
  overrunMinutes: number;
  protectedInfeasible: boolean;
  lesserInfeasible: boolean;
  physicalWarning: boolean;
  returnBreached: boolean;
}): HealthState {
  if (input.returnBreached || input.protectedInfeasible || input.overrunMinutes > 60) {
    return "broken";
  }
  if (input.overrunMinutes > 0 || input.lesserInfeasible) return "at_risk";
  if (input.timeLoadPct > 80 || input.physicalWarning) return "tight";
  return "comfortable";
}

/** Days from start to end inclusive; 0 when the journey has no end date yet. */
function journeyDayCount(journey: Journey): number {
  if (!journey.end_date) return 0;
  const span =
    Date.parse(`${journey.end_date}T00:00:00Z`) - Date.parse(`${journey.start_date}T00:00:00Z`);
  if (!Number.isFinite(span) || span < 0) return 0;
  return Math.min(MAX_REPORTED_DAYS, Math.floor(span / 86_400_000) + 1);
}

/** The minutes an item occupies — its likely duration, or a FIXED item's booked span. */
function loadDuration(item: JourneyItem): number {
  if (item.duration_likely_minutes != null) return item.duration_likely_minutes;
  if (item.fixed_start_at && item.fixed_end_at) {
    const span = Date.parse(item.fixed_end_at) - Date.parse(item.fixed_start_at);
    if (Number.isFinite(span) && span > 0) return Math.round(span / 60_000);
  }
  return 0;
}

/**
 * The three physical-load checks of PRD-HLTH-005, each raised only for a traveler who
 * actually has that constraint.
 *
 * Running every check for every group would bury the one warning that matters under two
 * that do not apply, and a warning nobody needs is a warning everybody learns to dismiss.
 */
function physicalLoad(
  items: JourneyItem[],
  knowledge: KnowledgeBundle,
  travelers: TravelerProfile[],
): Cause[] {
  const causes: Cause[] = [];

  // Distance, for travelers who can walk but not far.
  const limit = strictestWalkingLimit(travelers);
  const walkingMetres = walkingDistance(items, knowledge);
  if (limit !== null && walkingMetres > limit) {
    causes.push({
      check: "physical_load",
      key: "health.cause.walking_over_limit",
      params: { metres: walkingMetres, limitMetres: limit },
    });
  }

  // Step-free access, for travelers using a wheelchair.
  if (travelers.some((t) => t.mobility === "wheelchair")) {
    for (const item of items) {
      if (!item.place_id) continue;
      const place = knowledge.places.find((p) => p.id === item.place_id);
      if (!place) continue;

      // "Partial" and "not recorded" each get their own cause, never a pass. A wheelchair
      // user planning around silence is exactly the failure the trust model exists to
      // prevent, and "partial" is information they need in order to ask the right question.
      const key = STEP_FREE_CAUSE[place.step_free ?? "unknown"];
      if (key) causes.push({ check: "physical_load", key, itemId: item.id });
    }
  }

  // Rest cadence, for travelers who need frequent breaks.
  if (travelers.some((t) => t.mobility === "needs_rest_frequently")) {
    const stretch = longestStretchWithoutRest(items, knowledge);
    if (stretch > REST_INTERVAL_MINUTES) {
      causes.push({
        check: "physical_load",
        key: "health.cause.no_rest_in_stretch",
        params: { minutes: stretch, intervalMinutes: REST_INTERVAL_MINUTES },
      });
    }
  }

  return causes;
}

/**
 * The longest run of activity with no real break in it.
 *
 * A rest or meal shorter than ten minutes is a pause between two things, not a break, and
 * counting it would let a day of back-to-back queues report itself as well-paced.
 */
function longestStretchWithoutRest(items: JourneyItem[], knowledge: KnowledgeBundle): number {
  let longest = 0;
  let current = 0;

  items.forEach((item, index) => {
    const duration = item.duration_likely_minutes ?? 0;
    const isBreak =
      (item.item_type === "rest" || item.item_type === "meal") && duration >= REST_MINIMUM_MINUTES;

    if (isBreak) {
      current = 0;
      return;
    }

    if (index > 0) current += travelMinutes(items[index - 1]!, item, knowledge);
    current += duration;
    longest = Math.max(longest, current);
  });

  return longest;
}

/** Walking metres across the day, from cached estimates only — never guessed. */
function walkingDistance(items: JourneyItem[], knowledge: KnowledgeBundle): number {
  let metres = 0;

  items.forEach((item, index) => {
    if (index === 0) return;
    const from = items[index - 1]!;
    if (!from.place_id || !item.place_id) return;

    const estimate = (knowledge.travel_estimates ?? []).find(
      (e) =>
        e.from_place_id === from.place_id && e.to_place_id === item.place_id && e.mode === "walk",
    );
    metres += estimate?.distance_m ?? 0;
  });

  return metres;
}

/** The tightest walking limit in the group — a group moves at its most constrained pace. */
function strictestWalkingLimit(travelers: TravelerProfile[]): number | null {
  const limits = travelers
    .map((t) => WALKING_LIMIT_METRES[t.mobility])
    .filter((limit): limit is number => limit !== undefined);

  return limits.length > 0 ? Math.min(...limits) : null;
}

/**
 * Critical fields on the day carrying low confidence or a conflict (PRD F5 check 5).
 *
 * Shown as its own line rather than folded into the state: unverified information is a
 * different kind of problem from a day that will not fit, and conflating them would let a
 * comfortable-but-unverified day look identical to a comfortable, verified one.
 */
function trustExposureFor(items: JourneyItem[], knowledge: KnowledgeBundle): TrustCause[] {
  const trust = knowledge.trust ?? {};
  let lowConfidence = 0;
  let conflicted = 0;

  for (const item of items) {
    for (const id of [item.experience_id, item.place_id]) {
      if (!id) continue;
      for (const record of Object.values(trust[id] ?? {})) {
        if (record.conflict_flag) conflicted += 1;
        else if (record.confidence === "low") lowConfidence += 1;
      }
    }
  }

  const causes: TrustCause[] = [];
  if (lowConfidence > 0) {
    causes.push({ key: "health.trust.unverified", count: lowConfidence });
  }
  if (conflicted > 0) {
    causes.push({ key: "health.trust.conflicting", count: conflicted });
  }
  return causes;
}
