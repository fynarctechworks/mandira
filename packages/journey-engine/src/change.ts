import { resolveAvailability } from "./availability";
import { computeHealth, journeyDayCount, type HealthState, type TrustCause } from "./health";
import { checkItemAction } from "./item-rules";
import { scheduleDay } from "./schedule";
import { dateForDay, fromInstant, toMinutes } from "./time";
import type {
  Journey,
  JourneyItem,
  JourneyItemDependency,
  KnowledgeBundle,
  TimeOfDay,
  TravelerProfile,
} from "./types";

/** The `change_trigger_enum` vocabulary, verbatim (TRD §4.1). */
export type ChangeTriggerKind =
  | "user_late"
  | "user_done_delta"
  | "user_stay_longer"
  | "knowledge_update"
  | "live_transport"
  | "live_weather"
  | "item_added"
  | "item_removed"
  | "preferences_changed"
  | "availability_changed";

export type ChangeTrigger = {
  kind: ChangeTriggerKind;
  dayIndex: number;
  /** The item the trigger is about, where there is one. */
  itemId?: string;
  /** Minutes lost (positive) or gained (negative). Zero for structural triggers. */
  deltaMinutes?: number;
};

/** PRD F6 step 2. */
export type ChangeOutcome =
  "no_impact" | "tight" | "item_at_risk" | "protected_at_risk" | "return_at_risk";

/** The rungs of PRD F6's ladder, in the order they must be tried. */
export type LadderStep = "a" | "b" | "c" | "d" | "e" | "f";

/**
 * Every change is expressed as an absolute target, never as a delta from wherever the item
 * happens to be. Applying the same change twice must land in the same place: the card the
 * traveler sees was evaluated against these operations, and `applyOption` has to reproduce
 * exactly that, not something that depends on the order it ran in.
 */
export type ItemChange =
  | { op: "absorb_buffer"; itemId: string; byMinutes: number }
  | { op: "set_window"; itemId: string; startTime: TimeOfDay }
  | { op: "shorten"; itemId: string; toMinutes: number }
  | { op: "move_day"; itemId: string; toDayIndex: number }
  | { op: "remove"; itemId: string };

/**
 * One item an option changes, with where it was and where it would be (PRD F6: "each option
 * lists affected items with before/after times"). Instants, not strings to display — the
 * caller formats them in the traveler's timezone and language.
 */
export type AffectedItem = {
  itemId: string;
  beforeDayIndex: number;
  beforeStartAt: string | null;
  beforeEndAt: string | null;
  /** Null when the option removes the item. */
  afterDayIndex: number | null;
  afterStartAt: string | null;
  afterEndAt: string | null;
};

export type ChangeOption = {
  id: string;
  step: LadderStep;
  /** i18n key + params, never a rendered sentence — same rule as health causes. */
  labelKey: string;
  /** PRD F6: every recommendation ships a one-sentence "because". */
  becauseKey: string;
  params?: Record<string, string | number>;
  changes: ItemChange[];
  resultingState: HealthState;
  /** Every item whose time or day this option changes, including knock-on shifts. */
  affected: AffectedItem[];
  removedItemIds: string[];
  movedItemIds: string[];
  /** PRD F6: moving a PROTECTED item is always the traveler's explicit call. */
  requiresConfirmation: boolean;
};

export type ChangeCard = {
  outcome: ChangeOutcome;
  whatChanged: { key: string; params?: Record<string, string | number> };
  /** The health causes behind it — why this matters, in the engine's own terms. */
  whyItMatters: { key: string; params?: Record<string, string | number> }[];
  recommended: ChangeOption | null;
  /** The recommended option plus up to two others (PRD F6). */
  options: ChangeOption[];
  keepAsIs: { resultingState: HealthState };
  /** Present when the trigger came from knowledge or a live feed (PRD F6 rules). */
  trustExposure?: TrustCause[];
};

type Context = {
  journey: Journey;
  knowledge: KnowledgeBundle;
  travelers: TravelerProfile[];
  dependencies: JourneyItemDependency[];
  dayIndex: number;
  /** The plan as scheduled once the trigger is applied — what every option is compared to. */
  baseline: JourneyItem[];
};

/**
 * Evaluate a change and offer the traveler a way through it (PRD F6, TRD §5.1).
 *
 * Nothing here edits the journey. It returns a card describing what happened and what
 * could be done about it; the plan changes only when the traveler taps an option
 * (PRD Principle 6). That is why `applyOption` is a separate function and why this one
 * returns options rather than items.
 *
 * Options are generated in the ladder's fixed order and generation STOPS as soon as one
 * returns health to Tight or better. Offering a removal alongside an option that already
 * fixed things would imply the removal was necessary, which is a lie the traveler has no
 * way to check.
 */
export function evaluateChange(input: {
  journey: Journey;
  items: JourneyItem[];
  knowledge: KnowledgeBundle;
  travelers?: TravelerProfile[];
  dependencies?: JourneyItemDependency[];
  trigger: ChangeTrigger;
}): ChangeCard {
  const context: Context = {
    journey: input.journey,
    knowledge: input.knowledge,
    travelers: input.travelers ?? [],
    dependencies: input.dependencies ?? [],
    dayIndex: input.trigger.dayIndex,
    baseline: [],
  };

  // The journey as it stands once the trigger is taken into account, before any option.
  const afterTrigger = applyTrigger(input.items, input.trigger);
  const baseline = evaluate(afterTrigger, context);
  context.baseline = baseline.scheduled;
  const outcome = classify(baseline, afterTrigger, context);

  const card: ChangeCard = {
    outcome,
    whatChanged: whatChanged(input.trigger),
    whyItMatters: baseline.causes,
    recommended: null,
    options: [],
    keepAsIs: { resultingState: baseline.state },
    ...(isExternal(input.trigger) ? { trustExposure: baseline.trustExposure } : {}),
  };

  // PRD F6: `no_impact` shows a quiet toast, not a card. Returning an empty option list
  // rather than inventing one keeps that distinction in the data.
  if (outcome === "no_impact") return card;

  const options = rank(generateOptions(afterTrigger, context, baseline.state));

  card.recommended = options[0] ?? null;
  card.options = options.slice(0, 3);

  return card;
}

/**
 * Apply the option the traveler chose (TRD §5.1 `applyOption`).
 *
 * Returns new items; the input is not mutated. The caller re-schedules and re-runs health,
 * because an applied option is just an edit like any other and must be judged the same way.
 */
export function applyOption(input: { items: JourneyItem[]; option: ChangeOption }): {
  items: JourneyItem[];
  appliedChanges: ItemChange[];
} {
  let items = input.items;

  for (const change of input.option.changes) {
    items = applyChange(items, change);
  }

  return { items, appliedChanges: input.option.changes };
}

function applyChange(items: JourneyItem[], change: ItemChange): JourneyItem[] {
  switch (change.op) {
    case "remove":
      return items.filter((i) => i.id !== change.itemId);

    case "absorb_buffer":
      return items.map((i) =>
        i.id === change.itemId
          ? { ...i, buffer_minutes: Math.max(0, (i.buffer_minutes ?? 0) - change.byMinutes) }
          : i,
      );

    case "shorten":
      return items.map((i) =>
        i.id === change.itemId ? { ...i, duration_likely_minutes: change.toMinutes } : i,
      );

    case "move_day":
      return items.map((i) =>
        i.id === change.itemId ? { ...i, day_index: change.toDayIndex } : i,
      );

    case "set_window":
      // A preferred window, not a planned time: scheduling stays the single thing that
      // decides where an item lands on the clock.
      return items.map((i) =>
        i.id === change.itemId ? { ...i, preferred_window_start: change.startTime } : i,
      );
  }
}

// ── The ladder ───────────────────────────────────────────────────────────────

/**
 * PRD F6 step 3, in order, stopping at the first rung that reaches Tight or better.
 *
 * Two rules hold at every rung and are the reason several of them look conservative:
 * a FIXED item is never moved or removed, and a PROTECTED item is never removed. Those
 * are what the traveler said matters; an engine that overrides them has replaced their
 * judgement with its own arithmetic.
 */
function generateOptions(
  items: JourneyItem[],
  context: Context,
  baselineState: HealthState,
): ChangeOption[] {
  const options: ChangeOption[] = [];

  const rungs: (() => ChangeOption[])[] = [
    () => absorbIntoBuffers(items, context),
    () => shortenOrMoveOptional(items, context),
    () => moveImportantToAnotherDay(items, context),
    () => moveProtectedWithinAvailability(items, context),
    () => removeOptional(items, context),
    () => removeImportant(items, context),
  ];

  for (const rung of rungs) {
    for (const option of rung()) {
      // An option that leaves things no better than doing nothing is not an option; it is
      // a change with a cost and no benefit.
      if (!isImprovement(option.resultingState, baselineState)) continue;
      options.push(option);
    }

    if (options.some((o) => isAcceptable(o.resultingState))) break;
  }

  return options;
}

/** (a) Absorb into buffers and free time — the day still works, just with less room. */
function absorbIntoBuffers(items: JourneyItem[], context: Context): ChangeOption[] {
  const day = ofDay(items, context.dayIndex);
  const slack = day
    .filter((i) => (i.buffer_minutes ?? 0) > 0)
    .map((i) => ({ itemId: i.id, minutes: i.buffer_minutes ?? 0 }));

  const freeTime = day.filter(
    (i) => i.item_type === "free_time" && checkItemAction(i.tier, "remove").allowed,
  );

  if (slack.length === 0 && freeTime.length === 0) return [];

  const changes: ItemChange[] = [
    ...slack.map<ItemChange>((s) => ({
      op: "absorb_buffer",
      itemId: s.itemId,
      byMinutes: s.minutes,
    })),
    ...freeTime.map<ItemChange>((i) => ({ op: "remove", itemId: i.id })),
  ];

  const totalMinutes = slack.reduce((sum, s) => sum + s.minutes, 0);

  return [
    option({
      id: "opt-a-absorb",
      step: "a",
      labelKey: "change.option.absorb_buffers",
      becauseKey: "change.because.nothing_moves",
      params: { minutes: totalMinutes },
      changes,
      items,
      context,
    }),
  ];
}

/** (b) Shorten an OPTIONAL item, or move it to another day it can actually happen on. */
function shortenOrMoveOptional(items: JourneyItem[], context: Context): ChangeOption[] {
  const dayCount = dayCountOf(items, context.journey);

  return ofDay(items, context.dayIndex)
    .filter((i) => i.tier === "optional")
    .flatMap((item) => {
      const options: ChangeOption[] = [];
      const current = item.duration_likely_minutes ?? 0;
      const floor = minimumDuration(item, context.knowledge);

      // Shortening below what the place actually takes is not shortening, it is pretending.
      if (current > 0 && floor < current) {
        options.push(
          option({
            id: `opt-b-shorten-${item.id}`,
            step: "b",
            labelKey: "change.option.shorten_item",
            becauseKey: "change.because.keeps_everything",
            params: { itemId: item.id, fromMinutes: current, toMinutes: floor },
            changes: [{ op: "shorten", itemId: item.id, toMinutes: floor }],
            items,
            context,
          }),
        );
      }

      const target = checkItemAction(item.tier, "move").allowed
        ? feasibleDayFor(item, context, dayCount)
        : null;
      if (target !== null) {
        options.push(
          option({
            id: `opt-b-move-${item.id}`,
            step: "b",
            labelKey: "change.option.move_optional_to_day",
            becauseKey: "change.because.nothing_removed",
            params: { itemId: item.id, toDayIndex: target },
            changes: [{ op: "move_day", itemId: item.id, toDayIndex: target }],
            items,
            context,
          }),
        );
      }

      return options;
    });
}

/** (c) Move an IMPORTANT item to another day it can actually happen on. */
function moveImportantToAnotherDay(items: JourneyItem[], context: Context): ChangeOption[] {
  const dayCount = dayCountOf(items, context.journey);

  return ofDay(items, context.dayIndex)
    .filter((i) => i.tier === "important" && checkItemAction(i.tier, "move").allowed)
    .flatMap((item) => {
      const target = feasibleDayFor(item, context, dayCount);
      if (target === null) return [];

      return [
        option({
          id: `opt-c-move-${item.id}`,
          step: "c",
          labelKey: "change.option.move_to_day",
          becauseKey: "change.because.nothing_removed",
          params: { itemId: item.id, toDayIndex: target },
          changes: [{ op: "move_day", itemId: item.id, toDayIndex: target }],
          items,
          context,
        }),
      ];
    });
}

/**
 * (d) Move a PROTECTED item — only inside its own availability, and only with a tap.
 *
 * The traveler said this one matters. Moving it is allowed because the alternative is
 * losing it, but it is never quiet: the option is flagged for confirmation and the card
 * highlights it.
 */
function moveProtectedWithinAvailability(items: JourneyItem[], context: Context): ChangeOption[] {
  const date = dateForDay(context.journey.start_date, context.dayIndex);

  return ofDay(items, context.dayIndex)
    .filter(
      (i) => i.tier === "protected" && i.experience_id && checkItemAction(i.tier, "move").allowed,
    )
    .flatMap((item) => {
      const duration = item.duration_likely_minutes ?? 0;
      const current = currentStartOf(item, context, date);

      /*
       * Candidate starts: each window's opening, and the latest start that still finishes
       * inside it. The second is what makes a single long window useful — "go at 16:30
       * instead of 15:00" is a real option when a temple is open all afternoon, and requiring
       * two separate windows hid it in the most common case.
       */
      const later = availabilityWindows(item, context, date)
        .flatMap((w) =>
          [w.start, w.end - duration].filter((s) => s >= w.start && s + duration <= w.end),
        )
        .sort((a, b) => a - b)
        .find((s) => current === null || s > current);
      if (later === undefined) return [];

      return [
        option({
          id: `opt-d-move-${item.id}`,
          step: "d",
          labelKey: "change.option.move_protected_within_window",
          becauseKey: "change.because.keeps_protected",
          params: { itemId: item.id, startTime: asTime(later) },
          changes: [{ op: "set_window", itemId: item.id, startTime: asTime(later) }],
          items,
          context,
          requiresConfirmation: true,
        }),
      ];
    });
}

/** (e) Remove an OPTIONAL item. Always proposed, never applied on its own (PRD F4). */
function removeOptional(items: JourneyItem[], context: Context): ChangeOption[] {
  return ofDay(items, context.dayIndex)
    .filter((i) => i.tier === "optional" && checkItemAction(i.tier, "remove").allowed)
    .map((item) =>
      option({
        id: `opt-e-remove-${item.id}`,
        step: "e",
        labelKey: "change.option.remove_optional",
        becauseKey: "change.because.protects_the_rest",
        params: { itemId: item.id },
        changes: [{ op: "remove", itemId: item.id }],
        items,
        context,
      }),
    );
}

/** (f) Last resort: propose removing an IMPORTANT item. Never PROTECTED, never FIXED. */
function removeImportant(items: JourneyItem[], context: Context): ChangeOption[] {
  return ofDay(items, context.dayIndex)
    .filter((i) => i.tier === "important" && checkItemAction(i.tier, "remove").allowed)
    .map((item) =>
      option({
        id: `opt-f-remove-${item.id}`,
        step: "f",
        labelKey: "change.option.remove_important",
        becauseKey: "change.because.last_resort",
        params: { itemId: item.id },
        changes: [{ op: "remove", itemId: item.id }],
        items,
        context,
        requiresConfirmation: true,
      }),
    );
}

// ── Ranking ──────────────────────────────────────────────────────────────────

/**
 * PRD F6 step 4: protects more PROTECTED → fewer removed → fewer moved → less added travel.
 *
 * Health comes first regardless. An option that ranks well on every tiebreak and leaves the
 * day Broken has solved nothing.
 */
function rank(options: ChangeOption[]): ChangeOption[] {
  const STATE_ORDER: HealthState[] = ["comfortable", "tight", "at_risk", "broken"];
  const LADDER: LadderStep[] = ["a", "b", "c", "d", "e", "f"];

  return [...options].sort((a, b) => {
    const byState = STATE_ORDER.indexOf(a.resultingState) - STATE_ORDER.indexOf(b.resultingState);
    if (byState !== 0) return byState;

    const byRemoved = a.removedItemIds.length - b.removedItemIds.length;
    if (byRemoved !== 0) return byRemoved;

    const byMoved = a.movedItemIds.length - b.movedItemIds.length;
    if (byMoved !== 0) return byMoved;

    // The ladder is already ordered from least to most disruptive, so it is the last word.
    return LADDER.indexOf(a.step) - LADDER.indexOf(b.step);
  });
}

// ── Evaluation ───────────────────────────────────────────────────────────────

function option(input: {
  id: string;
  step: LadderStep;
  labelKey: string;
  becauseKey: string;
  params?: Record<string, string | number>;
  changes: ItemChange[];
  items: JourneyItem[];
  context: Context;
  requiresConfirmation?: boolean;
}): ChangeOption {
  const applied = input.changes.reduce(applyChange, input.items);
  // A move is judged on the day it leaves AND the day it lands on: relieving today by
  // breaking tomorrow is not an improvement, it is the same problem somewhere else.
  const touchedDays = input.changes.flatMap((c) => (c.op === "move_day" ? [c.toDayIndex] : []));
  const after = evaluate(applied, input.context, touchedDays);

  return {
    id: input.id,
    step: input.step,
    labelKey: input.labelKey,
    becauseKey: input.becauseKey,
    ...(input.params ? { params: input.params } : {}),
    changes: input.changes,
    resultingState: after.state,
    affected: affectedItems(input.context, after.scheduled, touchedDays),
    removedItemIds: input.changes.filter((c) => c.op === "remove").map((c) => c.itemId),
    movedItemIds: input.changes
      .filter((c) => c.op === "move_day" || c.op === "set_window")
      .map((c) => c.itemId),
    requiresConfirmation: input.requiresConfirmation ?? false,
  };
}

/** PRD F6: the items an option changes, each with its before and after times. */
function affectedItems(
  context: Context,
  afterScheduled: JourneyItem[],
  touchedDays: number[],
): AffectedItem[] {
  const involved = new Set([context.dayIndex, ...touchedDays]);
  const after = new Map(afterScheduled.map((item) => [item.id, item]));

  return context.baseline
    .filter((item) => involved.has(item.day_index))
    .flatMap<AffectedItem>((before) => {
      const now = after.get(before.id);
      const unchanged =
        now !== undefined &&
        now.day_index === before.day_index &&
        now.planned_start_at === before.planned_start_at &&
        now.planned_end_at === before.planned_end_at;
      if (unchanged) return [];

      return [
        {
          itemId: before.id,
          beforeDayIndex: before.day_index,
          beforeStartAt: before.planned_start_at ?? null,
          beforeEndAt: before.planned_end_at ?? null,
          afterDayIndex: now?.day_index ?? null,
          afterStartAt: now?.planned_start_at ?? null,
          afterEndAt: now?.planned_end_at ?? null,
        },
      ];
    });
}

/**
 * Re-schedule and re-run health, which is the only way to know what an option achieves.
 *
 * The state is judged on the trigger's day plus any day an option moves something onto —
 * never the whole journey. A card about a delay today must not be decided by an unrelated
 * problem next week: that suppressed every option whenever some other day was already
 * Broken, leaving the traveler with no card at all.
 */
function evaluate(items: JourneyItem[], context: Context, touchedDays: number[] = []) {
  const dayIndexes = [...new Set(items.map((i) => i.day_index))];
  const scheduled: JourneyItem[] = [];

  for (const dayIndex of dayIndexes) {
    const result = scheduleDay({
      journey: context.journey,
      dayIndex,
      items,
      knowledge: context.knowledge,
      travelers: context.travelers,
      dependencies: context.dependencies,
    });
    scheduled.push(...result.items);
  }

  const report = computeHealth({
    journey: context.journey,
    items: scheduled,
    knowledge: context.knowledge,
    travelers: context.travelers,
    dependencies: context.dependencies,
  });

  const day = report.days.find((d) => d.dayIndex === context.dayIndex);
  const judged = new Set([context.dayIndex, ...touchedDays]);

  const state = report.days
    .filter((d) => judged.has(d.dayIndex))
    .reduce<HealthState>(
      (worst, d) => (SEVERITY.indexOf(d.state) > SEVERITY.indexOf(worst) ? d.state : worst),
      "comfortable",
    );

  return {
    state,
    causes: day?.causes ?? [],
    trustExposure: day?.trustExposure ?? [],
    scheduled,
  };
}

/**
 * The trigger's effect on the plan, before any option is considered.
 *
 * A delay is modelled as extra time on the item the traveler is at, rather than as a
 * clock offset: the schedule is what decides where everything lands, and giving it a
 * second notion of "now" would let the two disagree.
 */
function applyTrigger(items: JourneyItem[], trigger: ChangeTrigger): JourneyItem[] {
  const delta = trigger.deltaMinutes ?? 0;
  if (delta === 0 || !trigger.itemId) return items;

  return items.map((item) =>
    item.id === trigger.itemId
      ? {
          ...item,
          duration_likely_minutes: Math.max(0, (item.duration_likely_minutes ?? 0) + delta),
        }
      : item,
  );
}

function classify(
  baseline: { state: HealthState; causes: { check: string }[] },
  items: JourneyItem[],
  context: Context,
): ChangeOutcome {
  if (baseline.causes.some((c) => c.check === "return_guard")) return "return_at_risk";

  const protectedAtRisk = baseline.causes.some((cause) => {
    const itemId = (cause as { itemId?: string }).itemId;
    if (!itemId) return false;
    const item = items.find((i) => i.id === itemId);
    return item?.tier === "protected" || item?.tier === "fixed";
  });
  if (protectedAtRisk) return "protected_at_risk";

  if (baseline.state === "broken" || baseline.state === "at_risk") return "item_at_risk";
  if (baseline.state === "tight") return "tight";

  // Comfortable with no causes: the trigger changed nothing that matters, and PRD F6 says
  // that is a quiet toast rather than a card demanding a decision.
  void context;
  return "no_impact";
}

function whatChanged(trigger: ChangeTrigger) {
  const params: Record<string, string | number> = {};
  if (trigger.deltaMinutes) params["minutes"] = Math.abs(trigger.deltaMinutes);
  if (trigger.itemId) params["itemId"] = trigger.itemId;

  return {
    key: `change.what.${trigger.kind}`,
    ...(Object.keys(params).length > 0 ? { params } : {}),
  };
}

/** PRD F6: an external trigger shows the trust badge of the information that caused it. */
function isExternal(trigger: ChangeTrigger): boolean {
  return (
    trigger.kind === "knowledge_update" ||
    trigger.kind === "live_transport" ||
    trigger.kind === "live_weather" ||
    trigger.kind === "availability_changed"
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

const ACCEPTABLE: HealthState[] = ["comfortable", "tight"];
const SEVERITY: HealthState[] = ["comfortable", "tight", "at_risk", "broken"];

function isAcceptable(state: HealthState): boolean {
  return ACCEPTABLE.includes(state);
}

function isImprovement(candidate: HealthState, baseline: HealthState): boolean {
  return SEVERITY.indexOf(candidate) < SEVERITY.indexOf(baseline);
}

function ofDay(items: JourneyItem[], dayIndex: number): JourneyItem[] {
  return items.filter((i) => i.day_index === dayIndex).sort((a, b) => a.sort_order - b.sort_order);
}

function minimumDuration(item: JourneyItem, knowledge: KnowledgeBundle): number {
  const experience = item.experience_id
    ? knowledge.experiences.find((e) => e.id === item.experience_id)
    : undefined;
  if (experience?.duration_min_minutes != null) return experience.duration_min_minutes;

  const place = item.place_id ? knowledge.places.find((p) => p.id === item.place_id) : undefined;
  return place?.visit_duration_min_minutes ?? item.duration_likely_minutes ?? 0;
}

/**
 * How many days an item could move between: the journey's own dates, or as far as its items
 * reach when it has no end date yet.
 *
 * NOT the number of days that already hold something. An empty day is the best place to move
 * something to, and counting only occupied days meant it was never offered — so a card for
 * an overloaded first day of a three-day journey recommended a removal instead.
 */
function dayCountOf(items: JourneyItem[], journey: Journey): number {
  return Math.max(journeyDayCount(journey), 0, ...items.map((i) => i.day_index + 1));
}

/** A day the item can actually happen on — availability first, capacity second. */
function feasibleDayFor(item: JourneyItem, context: Context, dayCount: number): number | null {
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    if (dayIndex === context.dayIndex) continue;

    const date = dateForDay(context.journey.start_date, dayIndex);
    if (availabilityWindows(item, context, date).length > 0 || !item.experience_id) {
      return dayIndex;
    }
  }
  return null;
}

/** Where an item currently starts: the traveler's preferred time, else where it is scheduled. */
function currentStartOf(item: JourneyItem, context: Context, date: string): number | null {
  if (item.preferred_window_start) return toMinutes(item.preferred_window_start);
  const scheduled =
    context.baseline.find((i) => i.id === item.id)?.planned_start_at ?? item.planned_start_at;
  return scheduled ? fromInstant(scheduled, date, context.journey.timezone) : null;
}

function availabilityWindows(
  item: JourneyItem,
  context: Context,
  date: string,
): { start: number; end: number }[] {
  if (!item.experience_id) return [];

  const rules = context.knowledge.availability_rules.filter(
    (r) => r.experience_id === item.experience_id,
  );
  if (rules.length === 0) return [];

  const experience = context.knowledge.experiences.find((e) => e.id === item.experience_id);
  const place = experience?.place_id
    ? context.knowledge.places.find((p) => p.id === experience.place_id)
    : undefined;

  const availability = resolveAvailability({
    rules,
    date,
    ...(place?.opening_schedule ? { openingSchedule: place.opening_schedule } : {}),
  });

  return availability.available
    ? availability.windows.map((w) => ({ start: toMinutes(w.start), end: toMinutes(w.end) }))
    : [];
}

function asTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}
