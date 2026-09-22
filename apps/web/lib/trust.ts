import type { TrustState } from "@mandhira/ui";

/**
 * The trust vocabulary and the rules over it — PURE, and deliberately in its own module.
 *
 * These live here rather than in `knowledge.ts` because client components need them and
 * `knowledge.ts` imports `next/headers` through the Supabase client. A "use client"
 * component that reaches even one type out of that module drags the whole server-only
 * chain into the browser bundle, and the build fails with an error naming `next/headers`
 * rather than the import that caused it.
 *
 * TypeScript cannot see that boundary, so nothing but the runtime will tell you. Keep this
 * file free of anything that touches a request, a cookie or a database.
 */

/** The trust payload the published views attach to every entity, keyed by field name. */
export type TrustEntry = {
  confidence: "high" | "medium" | "low";
  freshness: "fresh" | "aging" | "stale";
  verified_at: string | null;
  valid_until: string | null;
  source_name: string | null;
  source_tier_label: string | null;
  conflict_flag: boolean;
  /** The value changed after it was verified (0053); optional, so cached bundles still parse. */
  needs_reverification?: boolean;
};

export type TrustMap = Record<string, TrustEntry>;

/**
 * PRD F9's mapping from computed confidence to a badge, restated in one place.
 *
 * A conflict or staleness forces "Check locally" regardless of confidence: a field two
 * sources disagree about is not something to reassure anyone about, whatever its tier.
 *
 * So does an edit after verification (0053). "Verified" is a claim about the words on the
 * screen, not about the field they sit in; the moment the words change, nobody has checked
 * these ones, and the honest badge is the one that says so.
 */
export function trustStateOf(entry: TrustEntry | undefined): TrustState | null {
  if (!entry) return null;
  if (entry.needs_reverification) return "check_locally";
  if (entry.conflict_flag || entry.freshness === "stale") return "check_locally";
  if (entry.confidence === "high") return "verified";
  if (entry.confidence === "medium") return "verified_earlier";
  return "check_locally";
}

/**
 * The weakest badge across an entity's fields — what a CARD should show (D-083).
 *
 * A card carrying one "Verified" badge while an unshown field says "Check locally" would
 * be technically true and practically a lie. The card summarises; the detail page breaks
 * it down field by field.
 */
export function weakestTrustState(trust: TrustMap): TrustState | null {
  const order: TrustState[] = ["verified", "verified_earlier", "check_locally"];
  let worst: TrustState | null = null;

  for (const entry of Object.values(trust)) {
    const state = trustStateOf(entry);
    if (!state) continue;
    if (!worst || order.indexOf(state) > order.indexOf(worst)) worst = state;
  }

  return worst;
}

/**
 * The entry behind the weakest badge, so a badge that summarises an item can still open the
 * sheet for the field it is warning about (PRD F9: one tap from any badge to its source).
 */
export function weakestTrustEntry(trust: TrustMap): TrustEntry | undefined {
  const order: TrustState[] = ["verified", "verified_earlier", "check_locally"];
  let worst: { entry: TrustEntry; rank: number } | undefined;

  for (const entry of Object.values(trust)) {
    const state = trustStateOf(entry);
    if (!state) continue;
    const rank = order.indexOf(state);
    if (!worst || rank > worst.rank) worst = { entry, rank };
  }

  return worst?.entry;
}
