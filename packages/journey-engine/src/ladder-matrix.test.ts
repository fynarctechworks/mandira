import { describe, expect, it } from "vitest";

import { applyOption, evaluateChange, type ChangeTrigger, type LadderStep } from "./change";
import { computeHealth, type HealthState } from "./health";
import { scheduleDay } from "./schedule";
import { dateForDay, toInstant } from "./time";
import type {
  AvailabilityRule,
  Experience,
  Journey,
  JourneyItem,
  KnowledgeBundle,
  PriorityTier,
} from "./types";

/*
 * PRD-ADPT-008: the option ladder across 50 generated journeys × 8 triggers.
 *
 * Example tests prove the ladder does the right thing for journeys someone thought of. This
 * one generates journeys nobody thought of — mixed tiers, fixed commitments, availability
 * windows, buffers — and checks the rules that must hold for every one of them.
 */

const TZ = "Asia/Kolkata";
const START = "2026-11-02";
const SEVERITY: HealthState[] = ["comfortable", "tight", "at_risk", "broken"];
const LADDER: LadderStep[] = ["a", "b", "c", "d", "e", "f"];
const ACCEPTABLE = new Set<HealthState>(["comfortable", "tight"]);

type Case = { journey: Journey; items: JourneyItem[]; knowledge: KnowledgeBundle };

/** mulberry32: small, fast, and the same sequence on every machine. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let r = Math.imul(state ^ (state >>> 15), 1 | state);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const clock = (hour: number) => `${String(Math.min(hour, 23)).padStart(2, "0")}:00`;

function generate(seed: number): Case {
  const rand = seeded(seed);
  const between = (low: number, high: number) => low + Math.floor(rand() * (high - low + 1));
  const pick = <T>(values: readonly T[]) => values[Math.floor(rand() * values.length)]!;

  const journey: Journey = {
    id: `j${seed}`,
    start_date: START,
    timezone: TZ,
    day_start_time: "06:00",
    day_end_time: "21:00",
  };

  const items: JourneyItem[] = [];
  const experiences: Experience[] = [];
  const rules: AvailabilityRule[] = [];

  for (let day = 0, days = between(2, 4); day < days; day += 1) {
    const count = between(3, 8);

    for (let order = 0; order < count; order += 1) {
      const id = `s${seed}-d${day}-i${order}`;
      const item: JourneyItem = {
        id,
        day_index: day,
        sort_order: order,
        item_type: "experience",
        tier: pick<PriorityTier>(["protected", "important", "important", "optional", "optional"]),
        duration_likely_minutes: between(3, 18) * 10,
        buffer_minutes: pick([0, 0, 10, 15, 30]),
      };

      if (rand() < 0.3) {
        const opens = between(6, 14);
        const experienceId = `e-${id}`;
        experiences.push({ id: experienceId });
        rules.push({
          id: `r-${id}`,
          experience_id: experienceId,
          kind: "daily_fixed_times",
          daily_times: [{ start: clock(opens), end: clock(opens + between(3, 7)) }],
          priority: 1,
        });
        item.experience_id = experienceId;
      }

      items.push(item);
    }

    if (rand() < 0.4) {
      const at = toInstant(dateForDay(START, day), between(15, 19) * 60, TZ);
      items.push({
        id: `s${seed}-d${day}-fixed`,
        day_index: day,
        sort_order: count,
        item_type: "fixed_commitment",
        tier: "fixed",
        fixed_start_at: at,
        duration_likely_minutes: 30,
        buffer_minutes: 15,
      });
    }
  }

  return {
    journey,
    items,
    knowledge: {
      places: [],
      experiences,
      availability_rules: rules,
      routes: [],
      transport_connections: [],
    },
  };
}

function triggersFor(c: Case): ChangeTrigger[] {
  const firstOn = (day: number) =>
    c.items
      .filter((i) => i.day_index === day && i.tier !== "fixed")
      .sort((a, b) => a.sort_order - b.sort_order)[0];

  const first = firstOn(0)!;
  const second = firstOn(1) ?? first;

  return [
    { kind: "user_late", dayIndex: 0, itemId: first.id, deltaMinutes: 30 },
    { kind: "user_late", dayIndex: 0, itemId: first.id, deltaMinutes: 90 },
    { kind: "user_late", dayIndex: 0, itemId: first.id, deltaMinutes: 240 },
    { kind: "user_stay_longer", dayIndex: second.day_index, itemId: second.id, deltaMinutes: 60 },
    { kind: "user_done_delta", dayIndex: 0, itemId: first.id, deltaMinutes: -20 },
    { kind: "knowledge_update", dayIndex: second.day_index, itemId: second.id, deltaMinutes: 45 },
    { kind: "availability_changed", dayIndex: 0 },
    { kind: "live_weather", dayIndex: second.day_index },
  ];
}

/** The trigger's day state after taking out one item, scheduled the way the engine schedules. */
function stateWithout(c: Case, trigger: ChangeTrigger, removedId: string): HealthState {
  const delta = trigger.deltaMinutes ?? 0;
  const items = c.items
    .filter((i) => i.id !== removedId)
    .map((i) =>
      i.id === trigger.itemId && delta !== 0
        ? { ...i, duration_likely_minutes: Math.max(0, (i.duration_likely_minutes ?? 0) + delta) }
        : i,
    );

  const scheduled = [...new Set(items.map((i) => i.day_index))].flatMap(
    (dayIndex) =>
      scheduleDay({ journey: c.journey, dayIndex, items, knowledge: c.knowledge }).items,
  );

  const report = computeHealth({ journey: c.journey, items: scheduled, knowledge: c.knowledge });
  return report.days.find((d) => d.dayIndex === trigger.dayIndex)?.state ?? "comfortable";
}

describe("PRD-ADPT-008: the option ladder across 50 journeys × 8 triggers", () => {
  const cases = Array.from({ length: 50 }, (_, index) => generate(index + 1));

  it("holds every ladder rule for every generated journey and trigger", () => {
    let cards = 0;
    let cardsWithOptions = 0;

    for (const c of cases) {
      const tierOf = new Map(c.items.map((i) => [i.id, i.tier]));

      for (const trigger of triggersFor(c)) {
        const card = evaluateChange({ ...c, trigger });
        const where = `${c.journey.id} ${trigger.kind}${trigger.deltaMinutes ? `+${trigger.deltaMinutes}` : ""}`;
        cards += 1;

        expect(card.options.length, where).toBeLessThanOrEqual(3);

        if (card.outcome === "no_impact") {
          expect(card.options, `${where}: no_impact must not ask for a decision`).toEqual([]);
          continue;
        }

        if (card.options.length > 0) {
          cardsWithOptions += 1;
          expect(card.recommended, where).toEqual(card.options[0]);
        }

        for (const option of card.options) {
          const label = `${where} ${option.id}`;

          for (const change of option.changes) {
            const tier = tierOf.get(change.itemId);
            if (change.op === "remove") {
              expect(tier, `${label}: removed a ${tier} item`).not.toBe("fixed");
              expect(tier, `${label}: removed a ${tier} item`).not.toBe("protected");
            }
            if (change.op === "move_day" || change.op === "set_window" || change.op === "shorten") {
              expect(tier, `${label}: moved or shortened a FIXED item`).not.toBe("fixed");
            }
          }

          expect(
            SEVERITY.indexOf(option.resultingState),
            `${label}: offers a change that leaves the day no better than keeping it`,
          ).toBeLessThan(SEVERITY.indexOf(card.keepAsIs.resultingState));

          if (option.step === "d" || option.step === "f") {
            expect(option.requiresConfirmation, `${label}: needs the traveler's explicit yes`).toBe(
              true,
            );
          }

          const before = JSON.stringify(c.items);
          const once = applyOption({ items: c.items, option }).items;
          expect(JSON.stringify(c.items), `${label}: applyOption mutated its input`).toBe(before);
          expect(applyOption({ items: once, option }).items, `${label}: not idempotent`).toEqual(
            once,
          );
        }

        const working = card.options.filter((o) => ACCEPTABLE.has(o.resultingState));
        if (working.length > 0) {
          const firstWorkingRung = Math.min(...working.map((o) => LADDER.indexOf(o.step)));
          for (const option of card.options) {
            expect(
              LADDER.indexOf(option.step),
              `${where}: ${option.id} offered from a rung after one that already worked`,
            ).toBeLessThanOrEqual(firstWorkingRung);
          }
        }

        // "Where mathematically possible": if taking out one OPTIONAL or IMPORTANT item on the
        // trigger's day would restore Tight or better, the card must offer a way there.
        if (SEVERITY.indexOf(card.keepAsIs.resultingState) >= SEVERITY.indexOf("at_risk")) {
          const removable = c.items.filter(
            (i) =>
              i.day_index === trigger.dayIndex && (i.tier === "optional" || i.tier === "important"),
          );
          const possible = removable.some((i) => ACCEPTABLE.has(stateWithout(c, trigger, i.id)));

          if (possible) {
            expect(
              working.length,
              `${where}: one removal would restore the day, but no option does`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }

    expect(cards).toBe(400);
    // The matrix has to actually reach the ladder, or every assertion above is vacuous.
    expect(cardsWithOptions).toBeGreaterThan(40);
    // 400 evaluations plus the single-removal checks: seconds, not the 5 s default.
  }, 120_000);
});
