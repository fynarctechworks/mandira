import { describe, expect, it } from "vitest";
import { applyOption, evaluateChange, type ChangeTriggerKind, type ChangeOption } from "./change";
import { toInstant } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle, PriorityTier } from "./types";

const TZ = "Asia/Kolkata";
const START = "2026-10-12";

const journey: Journey = {
  id: "j1",
  start_date: START,
  timezone: TZ,
  day_start_time: "06:00",
  day_end_time: "21:00", // 900 minutes
};

const emptyKnowledge: KnowledgeBundle = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
};

const item = (over: Partial<JourneyItem> & { id: string; sort_order: number }): JourneyItem => ({
  day_index: 0,
  item_type: "experience",
  tier: "important",
  ...over,
});

/** A day that fits comfortably, so a trigger is the only thing that can break it. */
const comfortableDay = (): JourneyItem[] => [
  item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 120 }),
  item({ id: "b", sort_order: 1, tier: "important", duration_likely_minutes: 120 }),
  item({ id: "c", sort_order: 2, tier: "optional", duration_likely_minutes: 120 }),
];

describe("evaluateChange", () => {
  it("says nothing changed when nothing changed", () => {
    const card = evaluateChange({
      journey,
      items: comfortableDay(),
      knowledge: emptyKnowledge,
      trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 10 },
    });

    expect(card.outcome).toBe("no_impact");
    // PRD F6: a quiet toast, not a card demanding a decision.
    expect(card.options).toEqual([]);
    expect(card.recommended).toBeNull();
  });

  it("always says what the plan would look like if the traveler keeps it", () => {
    const card = evaluateChange({
      journey,
      items: comfortableDay(),
      knowledge: emptyKnowledge,
      trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 700 },
    });

    // "Keep as is" is always present, and always states the consequence (PRD F6).
    expect(card.keepAsIs.resultingState).toBe("broken");
  });

  it("returns i18n keys, never rendered sentences", () => {
    const card = evaluateChange({
      journey,
      items: comfortableDay(),
      knowledge: emptyKnowledge,
      trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 400 },
    });

    expect(card.whatChanged.key).toBe("change.what.user_late");
    for (const option of card.options) {
      expect(option.labelKey).toMatch(/^change\.option\./);
      // Every recommendation ships a reason (PRD Principle 6).
      expect(option.becauseKey).toMatch(/^change\.because\./);
    }
  });

  it("carries the trigger's own minutes into the card", () => {
    const card = evaluateChange({
      journey,
      items: comfortableDay(),
      knowledge: emptyKnowledge,
      trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 400 },
    });

    expect(card.whatChanged.params).toMatchObject({ minutes: 400, itemId: "a" });
  });

  describe("the ladder", () => {
    it("stops at (a) when the day's own buffers can absorb the delay", () => {
      const items = [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 300 }),
        item({
          id: "b",
          sort_order: 1,
          tier: "optional",
          duration_likely_minutes: 300,
          buffer_minutes: 120,
        }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge: emptyKnowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 250 },
      });

      expect(card.recommended?.step).toBe("a");
      // Offering a removal alongside an option that already fixed things would imply the
      // removal was necessary.
      expect(card.options.some((o) => o.step === "e" || o.step === "f")).toBe(false);
    });

    it("proposes removing an OPTIONAL item before an IMPORTANT one", () => {
      const items = [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 300 }),
        item({ id: "b", sort_order: 1, tier: "important", duration_likely_minutes: 300 }),
        item({ id: "c", sort_order: 2, tier: "optional", duration_likely_minutes: 300 }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge: emptyKnowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 200 },
      });

      const removals = card.options.filter((o) => o.removedItemIds.length > 0);
      expect(removals.length).toBeGreaterThan(0);
      expect(removals.every((o) => o.removedItemIds.every((id) => id === "c"))).toBe(true);
    });

    it("offers at most three options", () => {
      const items = [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 300 }),
        ...Array.from({ length: 6 }, (_, i) =>
          item({
            id: `o${i}`,
            sort_order: i + 1,
            tier: "optional" as PriorityTier,
            duration_likely_minutes: 100,
          }),
        ),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge: emptyKnowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 400 },
      });

      expect(card.options.length).toBeLessThanOrEqual(3);
    });

    it("offers no option that leaves the day no better than doing nothing", () => {
      const items = [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 800 }),
        item({ id: "b", sort_order: 1, tier: "protected", duration_likely_minutes: 800 }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge: emptyKnowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 100 },
      });

      // Both PROTECTED, nothing to give up: there is genuinely no option, and saying so
      // beats offering a change with a cost and no benefit.
      expect(card.options).toEqual([]);
      expect(card.keepAsIs.resultingState).toBe("broken");
    });

    it("moves an IMPORTANT item to another day before proposing to remove anything", () => {
      const items = [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 500 }),
        item({ id: "b", sort_order: 1, tier: "important", duration_likely_minutes: 500 }),
        item({ id: "spare", sort_order: 0, day_index: 1, duration_likely_minutes: 30 }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge: emptyKnowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 100 },
      });

      expect(card.recommended?.step).toBe("c");
      expect(card.recommended?.changes).toEqual([{ op: "move_day", itemId: "b", toDayIndex: 1 }]);
      expect(card.recommended?.removedItemIds).toEqual([]);
    });

    it("will not move an item to a day it cannot happen on", () => {
      const knowledge: KnowledgeBundle = {
        ...emptyKnowledge,
        experiences: [{ id: "e1", duration_likely_minutes: 500 }],
        availability_rules: [
          {
            id: "r1",
            experience_id: "e1",
            kind: "calendar_dates",
            // Only on day 0, the day it is already on.
            calendar_dates: [START],
            priority: 1,
          },
        ],
      };

      const items = [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 500 }),
        item({
          id: "b",
          sort_order: 1,
          tier: "important",
          experience_id: "e1",
          duration_likely_minutes: 500,
        }),
        item({ id: "spare", sort_order: 0, day_index: 1, duration_likely_minutes: 30 }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 100 },
      });

      // Rung (c) has nowhere to put it, so the ladder carries on rather than proposing a
      // move that would quietly land the item on a day it does not run.
      expect(card.options.every((o) => o.step !== "c")).toBe(true);
    });

    it("shortens down to the place's own minimum when the experience has none", () => {
      const knowledge: KnowledgeBundle = {
        ...emptyKnowledge,
        places: [{ id: "p1", visit_duration_min_minutes: 60 }],
      };

      const items = [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 500 }),
        item({
          id: "b",
          sort_order: 1,
          tier: "optional",
          place_id: "p1",
          duration_likely_minutes: 400,
        }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 100 },
      });

      expect(card.options.find((o) => o.step === "b")?.changes).toEqual([
        { op: "shorten", itemId: "b", toMinutes: 60 },
      ]);
    });
  });

  describe("the rules that never bend", () => {
    const mixedDay = (): JourneyItem[] => [
      item({
        id: "train",
        sort_order: 0,
        tier: "fixed",
        item_type: "fixed_commitment",
        fixed_start_at: toInstant(START, 19 * 60, TZ),
        duration_likely_minutes: 60,
      }),
      item({ id: "prot", sort_order: 1, tier: "protected", duration_likely_minutes: 400 }),
      item({ id: "imp", sort_order: 2, tier: "important", duration_likely_minutes: 400 }),
      item({ id: "opt", sort_order: 3, tier: "optional", duration_likely_minutes: 400 }),
    ];

    const allTriggers: ChangeTriggerKind[] = [
      "user_late",
      "user_done_delta",
      "user_stay_longer",
      "knowledge_update",
      "live_transport",
      "live_weather",
      "item_added",
      "item_removed",
      "preferences_changed",
      "availability_changed",
    ];

    it.each(allTriggers)("never proposes removing a PROTECTED or FIXED item (%s)", (kind) => {
      const items = mixedDay();
      const card = evaluateChange({
        journey,
        items,
        knowledge: emptyKnowledge,
        trigger: { kind, dayIndex: 0, itemId: "prot", deltaMinutes: 300 },
      });

      const protectedOrFixed = new Set(
        items.filter((i) => i.tier === "protected" || i.tier === "fixed").map((i) => i.id),
      );

      for (const option of card.options) {
        for (const id of option.removedItemIds) {
          expect(protectedOrFixed.has(id)).toBe(false);
        }
      }
    });

    it.each(allTriggers)("never moves a FIXED item (%s)", (kind) => {
      const card = evaluateChange({
        journey,
        items: mixedDay(),
        knowledge: emptyKnowledge,
        trigger: { kind, dayIndex: 0, itemId: "prot", deltaMinutes: 300 },
      });

      for (const option of card.options) {
        expect(option.movedItemIds).not.toContain("train");
        expect(option.changes.every((c) => c.itemId !== "train")).toBe(true);
      }
    });

    it("flags an option that moves a PROTECTED item for confirmation", () => {
      const knowledge: KnowledgeBundle = {
        ...emptyKnowledge,
        experiences: [{ id: "e1", duration_likely_minutes: 400 }],
        availability_rules: [
          {
            id: "r1",
            experience_id: "e1",
            kind: "daily_fixed_times",
            daily_times: [
              { start: "06:00", end: "13:00" },
              { start: "14:00", end: "21:00" },
            ],
            priority: 1,
          },
        ],
      };

      const items = [
        item({
          id: "prot",
          sort_order: 0,
          tier: "protected",
          experience_id: "e1",
          preferred_window_start: "06:00",
          duration_likely_minutes: 400,
        }),
        item({ id: "imp", sort_order: 1, tier: "important", duration_likely_minutes: 400 }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "prot", deltaMinutes: 200 },
      });

      for (const option of card.options.filter((o) => o.step === "d")) {
        expect(option.requiresConfirmation).toBe(true);
      }
    });

    it("never shortens an item below the duration the place actually takes", () => {
      const knowledge: KnowledgeBundle = {
        ...emptyKnowledge,
        experiences: [{ id: "e1", duration_min_minutes: 90, duration_likely_minutes: 300 }],
      };

      const items = [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 500 }),
        item({
          id: "b",
          sort_order: 1,
          tier: "optional",
          experience_id: "e1",
          duration_likely_minutes: 300,
        }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 200 },
      });

      for (const option of card.options) {
        for (const change of option.changes) {
          if (change.op === "shorten") expect(change.toMinutes).toBeGreaterThanOrEqual(90);
        }
      }
    });
  });

  describe("outcome classification", () => {
    it("reports a breached return as return_at_risk, above everything else", () => {
      const items = [
        item({
          id: "long",
          sort_order: 0,
          tier: "optional",
          place_id: "p1",
          duration_likely_minutes: 600,
        }),
        item({
          id: "train",
          sort_order: 1,
          tier: "fixed",
          item_type: "fixed_commitment",
          place_id: "station",
          travel_mode: "vehicle",
          fixed_start_at: toInstant(START, 17 * 60, TZ),
        }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge: {
          ...emptyKnowledge,
          travel_estimates: [
            {
              from_place_id: "p1",
              to_place_id: "station",
              mode: "vehicle",
              duration_seconds: 7200,
            },
          ],
        },
        trigger: { kind: "user_late", dayIndex: 0, itemId: "long", deltaMinutes: 60 },
      });

      expect(card.outcome).toBe("return_at_risk");
    });

    it("reports tight as tight, without demanding a decision be made about it", () => {
      const items = [
        item({ id: "a", sort_order: 0, tier: "important", duration_likely_minutes: 400 }),
        item({ id: "b", sort_order: 1, tier: "optional", duration_likely_minutes: 340 }),
      ];

      const card = evaluateChange({
        journey,
        items,
        knowledge: emptyKnowledge,
        trigger: { kind: "user_stay_longer", dayIndex: 0, itemId: "a", deltaMinutes: 5 },
      });

      expect(card.outcome).toBe("tight");
    });
  });

  describe("trust", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      trust: {
        e1: { opening_hours: { confidence: "low", freshness: "stale", conflict_flag: false } },
      },
    };

    const items = () => [
      item({
        id: "a",
        sort_order: 0,
        tier: "protected",
        experience_id: "e1",
        duration_likely_minutes: 800,
      }),
      item({ id: "b", sort_order: 1, tier: "optional", duration_likely_minutes: 400 }),
    ];

    it("shows trust exposure when the trigger came from outside", () => {
      const card = evaluateChange({
        journey,
        items: items(),
        knowledge,
        trigger: { kind: "knowledge_update", dayIndex: 0, itemId: "a" },
      });

      expect(card.trustExposure).toEqual([{ key: "health.trust.unverified", count: 1 }]);
    });

    it("does not show it for a change the traveler made themselves", () => {
      // They know where the information came from; repeating it here is noise.
      const card = evaluateChange({
        journey,
        items: items(),
        knowledge,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 30 },
      });

      expect(card.trustExposure).toBeUndefined();
    });
  });
});

describe("applyOption", () => {
  const items = [
    item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 120 }),
    item({
      id: "b",
      sort_order: 1,
      tier: "optional",
      duration_likely_minutes: 120,
      buffer_minutes: 30,
    }),
  ];

  const optionWith = (changes: ChangeOption["changes"]): ChangeOption => ({
    id: "test",
    step: "e",
    labelKey: "change.option.remove_optional",
    becauseKey: "change.because.protects_the_rest",
    changes,
    resultingState: "comfortable",
    affected: [],
    removedItemIds: [],
    movedItemIds: [],
    requiresConfirmation: false,
  });

  it("removes an item", () => {
    const result = applyOption({ items, option: optionWith([{ op: "remove", itemId: "b" }]) });

    expect(result.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("shortens an item", () => {
    const result = applyOption({
      items,
      option: optionWith([{ op: "shorten", itemId: "b", toMinutes: 45 }]),
    });

    expect(result.items.find((i) => i.id === "b")?.duration_likely_minutes).toBe(45);
  });

  it("moves an item to another day", () => {
    const result = applyOption({
      items,
      option: optionWith([{ op: "move_day", itemId: "b", toDayIndex: 2 }]),
    });

    expect(result.items.find((i) => i.id === "b")?.day_index).toBe(2);
  });

  it("sets a preferred window", () => {
    const result = applyOption({
      items,
      option: optionWith([{ op: "set_window", itemId: "a", startTime: "14:00" }]),
    });

    expect(result.items.find((i) => i.id === "a")?.preferred_window_start).toBe("14:00");
  });

  it("never takes a buffer below zero", () => {
    const result = applyOption({
      items,
      option: optionWith([{ op: "absorb_buffer", itemId: "b", byMinutes: 500 }]),
    });

    expect(result.items.find((i) => i.id === "b")?.buffer_minutes).toBe(0);
  });

  it("leaves the original items untouched", () => {
    applyOption({ items, option: optionWith([{ op: "remove", itemId: "b" }]) });

    expect(items).toHaveLength(2);
  });

  it("lands in the same place however many times it is applied", () => {
    // The card the traveler saw was evaluated against these operations; applying them has
    // to reproduce exactly that, not something that depends on how often it ran.
    const option = optionWith([
      { op: "shorten", itemId: "b", toMinutes: 45 },
      { op: "set_window", itemId: "a", startTime: "14:00" },
    ]);

    const once = applyOption({ items, option }).items;
    const twice = applyOption({ items: once, option }).items;

    expect(twice).toEqual(once);
  });

  it("produces what the option promised", () => {
    const card = evaluateChange({
      journey,
      items: [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 500 }),
        item({ id: "b", sort_order: 1, tier: "optional", duration_likely_minutes: 500 }),
      ],
      knowledge: emptyKnowledge,
      trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 100 },
    });

    const chosen = card.recommended!;
    const applied = applyOption({
      items: [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 600 }),
        item({ id: "b", sort_order: 1, tier: "optional", duration_likely_minutes: 500 }),
      ],
      option: chosen,
    });

    expect(applied.appliedChanges).toEqual(chosen.changes);
    for (const id of chosen.removedItemIds) {
      expect(applied.items.map((i) => i.id)).not.toContain(id);
    }
  });
});
