/**
 * Progressive personalization from EXPLICIT signals only (PRD-ACCT-004, PRD §5 F13).
 *
 * PURE, and deliberately so: every rule about what Mandhira may learn from a traveler is
 * testable here without a database, and the one rule that matters — that nothing is
 * inferred from behaviour the traveler did not choose — is a property of this file rather
 * than a promise in a document.
 *
 * What counts as explicit is the whole point. A traveler setting a tier said something. A
 * traveler keeping an item when offered its removal said something. A traveler who scrolled
 * past a temple, or lingered on a photo, or opened a page three times, said NOTHING, and
 * `personalization_signals` has no way to record any of it (0004): there is no dwell time,
 * no view count and no scroll depth in the table, so this module could not read one if it
 * wanted to.
 *
 * The output carries its own explanation. PRD §5 requires "Because you protected [X] last
 * time" on the screen, which means a ranker that returns a number is not enough — the
 * reason has to travel with the rank or the UI has to invent one.
 */

/** The explicit signals the table allows (0004's CHECK constraint, in one place). */
export type SignalType =
  | "tier_set"
  | "preference_set"
  | "item_kept"
  | "item_removed"
  | "pace_changed"
  | "experience_completed";

export type Signal = {
  signal_type: SignalType;
  entity_table: string | null;
  entity_id: string | null;
  /** For `tier_set`, `{ tier }`; for the rest, whatever the action recorded. */
  value: Record<string, unknown> | null;
  created_at: string;
};

/** What a traveler told us about one kind of thing, and the words for saying it back. */
export type Affinity = {
  /** The entity the signal was about — an experience or a place. */
  entityId: string;
  /** Higher is stronger. Never a percentage, and never shown as one. */
  weight: number;
  /** Which message key explains it, so the UI does not compose a reason itself. */
  reason: "protected" | "kept" | "completed" | "removed";
};

/*
 * Weights, and why these.
 *
 * Protecting something is the strongest thing a traveler can say short of fixing it to a
 * time: PROTECTED means "this is why I am going". Keeping an item when the app offered to
 * remove it is nearly as strong, because it was a choice made under pressure. Completing
 * one is weaker — it means they went, not that they would go again.
 *
 * Removing is NEGATIVE and half the size of protecting. A traveler who dropped something
 * once may have dropped it for time rather than taste, so it nudges rather than bans:
 * nothing here can push an item out of a list, only reorder one.
 */
const WEIGHTS: Record<string, number> = {
  "tier_set:fixed": 3,
  "tier_set:protected": 3,
  "tier_set:important": 1,
  "tier_set:optional": 0,
  item_kept: 2,
  experience_completed: 1,
  item_removed: -1.5,
};

/**
 * How far back a signal counts, in days.
 *
 * A pilgrimage is not a habit. What somebody protected two years ago says little about the
 * journey they are planning now, and a recommendation explained by "because you protected
 * X last time" is only honest while "last time" is recent enough to remember.
 */
export const SIGNAL_HORIZON_DAYS = 400;

export function affinitiesFrom(signals: Signal[], nowMs: number): Map<string, Affinity> {
  const horizon = nowMs - SIGNAL_HORIZON_DAYS * 86_400_000;
  const byEntity = new Map<string, Affinity>();

  for (const signal of signals) {
    if (!signal.entity_id) continue;
    const at = Date.parse(signal.created_at);
    if (Number.isNaN(at) || at < horizon) continue;

    const tier = typeof signal.value?.["tier"] === "string" ? signal.value["tier"] : null;
    const key = signal.signal_type === "tier_set" ? `tier_set:${tier}` : signal.signal_type;
    const weight = WEIGHTS[key];
    if (weight === undefined || weight === 0) continue;

    const existing = byEntity.get(signal.entity_id);
    const next = (existing?.weight ?? 0) + weight;

    /*
     * The reason shown is the one behind the STRONGEST single signal, not the latest. A
     * traveler who protected a temple and later removed it once should still be told the
     * protection is why it is high, because that is what is actually true of the ranking.
     */
    const strongestSoFar = existing ? mostSignificantWeight(existing.reason) : -Infinity;
    const reason: Affinity["reason"] =
      !existing || weight >= strongestSoFar ? reasonFor(signal.signal_type, tier) : existing.reason;

    byEntity.set(signal.entity_id, { entityId: signal.entity_id, weight: next, reason });
  }

  return byEntity;
}

function reasonFor(type: SignalType, tier: string | null): Affinity["reason"] {
  if (type === "tier_set") return tier === "important" ? "kept" : "protected";
  if (type === "item_kept") return "kept";
  if (type === "item_removed") return "removed";
  return "completed";
}

function mostSignificantWeight(reason: Affinity["reason"]): number {
  if (reason === "protected") return 3;
  if (reason === "kept") return 2;
  if (reason === "completed") return 1;
  return -1.5;
}

/**
 * A reason that can be SHOWN. "removed" is deliberately not one: the app never tells a
 * traveler that something is lower because they once dropped it, so the type does not let a
 * screen ask for wording that does not exist.
 */
export type ShownReason = Exclude<Affinity["reason"], "removed">;

export type Ranked<T> = { item: T; because: ShownReason | null };

/**
 * Reorders a list by what the traveler has told us, and says why for each one that moved.
 *
 * STABLE: equal affinity keeps the order the caller supplied, which is editorial weight and
 * journey fit (D-083). Personalization is a tie-breaker over editorial judgement, never a
 * replacement for it — a traveler's first journey must not be worse than their second
 * because the app has nothing to go on yet.
 *
 * `because` is null unless the signal genuinely moved the item UP. Labelling something
 * "because you protected X" when it was going to be first anyway is a false explanation,
 * and a negative signal is never explained at all: telling somebody an item is lower
 * because they once removed it would be a judgement nobody asked for.
 */
export function rankByAffinity<T>(
  items: T[],
  idOf: (item: T) => string | null,
  affinities: Map<string, Affinity>,
): Ranked<T>[] {
  const weighted = items.map((item, index) => {
    const id = idOf(item);
    const affinity = id ? affinities.get(id) : undefined;
    return { item, index, weight: affinity?.weight ?? 0, reason: affinity?.reason ?? null };
  });

  const sorted = [...weighted].sort((a, b) => b.weight - a.weight || a.index - b.index);

  return sorted.map((entry, position) => ({
    item: entry.item,
    because:
      entry.weight > 0 &&
      position < entry.index &&
      entry.reason !== null &&
      entry.reason !== "removed"
        ? entry.reason
        : null,
  }));
}
