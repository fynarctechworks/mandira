import { describe, expect, it } from "vitest";
import { checkItemAction, checkItemActionFor, type ItemAction } from "./item-rules";
import type { JourneyItem, PriorityTier } from "./types";

const TIERS: PriorityTier[] = ["fixed", "protected", "important", "optional"];
const ACTIONS: ItemAction[] = ["remove", "move", "retier", "set_buffer", "annotate"];

const item = (over: Partial<JourneyItem> & { id: string; tier: PriorityTier }): JourneyItem => ({
  day_index: 0,
  sort_order: 0,
  item_type: "experience",
  ...over,
});

describe("checkItemAction — PRD-PLAN-002, the whole tier × action matrix", () => {
  it.each(TIERS)("never blocks retiering a %s item", (tier) => {
    // The tier is the traveler restating what matters. Nothing may block that, including
    // deciding that a FIXED item is no longer fixed.
    expect(checkItemAction(tier, "retier")).toEqual({
      allowed: true,
      requiresConfirmation: false,
    });
  });

  it.each(TIERS)("lets a %s item's buffer be edited (PRD-PLAN-005)", (tier) => {
    // Even on a FIXED item: the anchor does not move, but how much room you leave to reach
    // it is the traveler's call.
    expect(checkItemAction(tier, "set_buffer").allowed).toBe(true);
  });

  it.each(TIERS)("lets a %s item be annotated", (tier) => {
    expect(checkItemAction(tier, "annotate").allowed).toBe(true);
  });

  describe("moving", () => {
    it("refuses to move a FIXED item, and says why", () => {
      expect(checkItemAction("fixed", "move")).toEqual({
        allowed: false,
        reasonKey: "plan.rule.fixed_cannot_move",
      });
    });

    it.each<PriorityTier>(["protected", "important", "optional"])(
      "allows moving a %s item, but only with confirmation",
      (tier) => {
        // A plan that rearranges itself under someone is not a plan they own
        // (PRD Principle 6).
        expect(checkItemAction(tier, "move")).toEqual({
          allowed: true,
          requiresConfirmation: true,
        });
      },
    );
  });

  describe("removing", () => {
    it("refuses to remove a FIXED item", () => {
      expect(checkItemAction("fixed", "remove")).toEqual({
        allowed: false,
        reasonKey: "plan.rule.fixed_cannot_remove",
      });
    });

    it("refuses to remove a PROTECTED item", () => {
      // The one the traveler said they came for. The engine may propose everything else
      // first; it may never propose this.
      expect(checkItemAction("protected", "remove")).toEqual({
        allowed: false,
        reasonKey: "plan.rule.protected_cannot_remove",
      });
    });

    it.each<PriorityTier>(["important", "optional"])(
      "allows removing a %s item, with confirmation",
      (tier) => {
        expect(checkItemAction(tier, "remove")).toEqual({
          allowed: true,
          requiresConfirmation: true,
        });
      },
    );
  });

  it("never allows a destructive action without asking", () => {
    // Sweeping the matrix rather than trusting the cases above to be exhaustive: a new
    // action added later must not default to silent.
    for (const tier of TIERS) {
      for (const action of ACTIONS) {
        const verdict = checkItemAction(tier, action);
        if (verdict.allowed && (action === "remove" || action === "move")) {
          expect(verdict.requiresConfirmation).toBe(true);
        }
      }
    }
  });

  it("gives a reason key, never a rendered sentence", () => {
    for (const tier of TIERS) {
      for (const action of ACTIONS) {
        const verdict = checkItemAction(tier, action);
        if (!verdict.allowed) expect(verdict.reasonKey).toMatch(/^plan\.rule\.[a-z_]+$/);
      }
    }
  });
});

describe("checkItemActionFor", () => {
  const items = [item({ id: "a", tier: "fixed" }), item({ id: "b", tier: "optional" })];

  it("reads the tier from the item rather than trusting the caller", () => {
    expect(checkItemActionFor(items, "a", "remove").allowed).toBe(false);
    expect(checkItemActionFor(items, "b", "remove").allowed).toBe(true);
  });

  it("refuses an item it cannot find, rather than permitting it", () => {
    // "We could not find it" and "you may do this to it" are different answers, and
    // defaulting to the second is how a deleted row becomes an unguarded write.
    expect(checkItemActionFor(items, "ghost", "remove")).toEqual({
      allowed: false,
      reasonKey: "plan.rule.item_not_found",
    });
  });
});
