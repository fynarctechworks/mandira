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
};

export type TrustMap = Record<string, TrustEntry>;

/**
 * PRD F9's mapping from computed confidence to a badge, restated in one place.
 *
 * A conflict or staleness forces "Check locally" regardless of confidence: a field two
 * sources disagree about is not something to reassure anyone about, whatever its tier.
 */
export function trustStateOf(entry: TrustEntry | undefined): TrustState | null {
  if (!entry) return null;
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
