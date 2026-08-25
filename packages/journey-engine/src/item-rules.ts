import type { JourneyItem, PriorityTier } from "./types";

/**
 * What may be done to an item, by its tier (PRD-PLAN-002, PRD F4).
 *
 * These are ENGINE rules, not UI rules. The tier is the traveler's own statement of what
 * matters, and PRD F4 spells out exactly what the system may do to each one:
 *
 *   FIXED      — never moved, never removed. Trains, booked slots, the journey home.
 *   PROTECTED  — never removed. May be moved, only with confirmation.
 *   IMPORTANT  — may be moved or swapped, with confirmation. Never removed without asking.
 *   OPTIONAL   — proposed for removal first. Always asked.
 *
 * They live here rather than in a route handler because the same rules govern the option
 * ladder (`change.ts`) and any client that edits offline. One statement of the rule, so a
 * screen, a route and an offline edit cannot disagree about what is allowed.
 *
 * Hiding a button is never the control (CLAUDE.md §4). Every API that mutates an item runs
 * this and refuses, so a crafted request is stopped by the same rule the UI obeys.
 */
export type ItemAction = "remove" | "move" | "retier" | "set_buffer" | "annotate";

export type RuleVerdict =
  { allowed: true; requiresConfirmation: boolean } | { allowed: false; reasonKey: string };

/**
 * Whether `action` may be applied to an item of this tier.
 *
 * `requiresConfirmation` is not advisory. PRD Principle 6 makes every state-changing
 * journey action an explicit tap, so it tells a caller which changes need the traveler to
 * have said yes to this specific thing — not merely to have tapped something.
 */
export function checkItemAction(tier: PriorityTier, action: ItemAction): RuleVerdict {
  if (action === "retier") {
    // Retiering is the traveler restating what matters. Nothing may block that — including
    // a FIXED item, which they may decide is no longer fixed.
    return { allowed: true, requiresConfirmation: false };
  }

  if (action === "annotate" || action === "set_buffer") {
    // Neither changes what happens or whether it happens. Buffers are explicitly editable
    // (PRD-PLAN-005), including on a FIXED item — the anchor does not move, but how much
    // room you leave to reach it is the traveler's call.
    return { allowed: true, requiresConfirmation: false };
  }

  if (action === "move") {
    return tier === "fixed"
      ? { allowed: false, reasonKey: "plan.rule.fixed_cannot_move" }
      : // PROTECTED and IMPORTANT both need a yes; OPTIONAL is asked too, because a plan
        // that rearranges itself under someone is not a plan they own.
        { allowed: true, requiresConfirmation: true };
  }

  // remove
  if (tier === "fixed") return { allowed: false, reasonKey: "plan.rule.fixed_cannot_remove" };
  if (tier === "protected") {
    return { allowed: false, reasonKey: "plan.rule.protected_cannot_remove" };
  }
  return { allowed: true, requiresConfirmation: true };
}

/**
 * The same question for a concrete item, so a caller cannot check the wrong tier.
 *
 * A missing item is refused rather than treated as permitted — "we could not find it" and
 * "you may do this to it" are different answers, and defaulting to the second is how a
 * deleted row becomes an unguarded write.
 */
export function checkItemActionFor(
  items: JourneyItem[],
  itemId: string,
  action: ItemAction,
): RuleVerdict {
  const item = items.find((i) => i.id === itemId);
  if (!item) return { allowed: false, reasonKey: "plan.rule.item_not_found" };
  return checkItemAction(item.tier, action);
}

/** Every reason this module can refuse for, so a caller can render them all. */
export const ITEM_RULE_REASONS = [
  "plan.rule.fixed_cannot_move",
  "plan.rule.fixed_cannot_remove",
  "plan.rule.protected_cannot_remove",
  "plan.rule.item_not_found",
] as const;
