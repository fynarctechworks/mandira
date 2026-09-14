import { describe, expect, it } from "vitest";

import { weakestTrustEntry, type TrustEntry } from "./trust";

const entry = (over: Partial<TrustEntry>): TrustEntry => ({
  confidence: "high",
  freshness: "fresh",
  verified_at: "2026-09-01T00:00:00Z",
  valid_until: null,
  source_name: "Temple trust",
  source_tier_label: "Official",
  conflict_flag: false,
  ...over,
});

describe("weakestTrustEntry", () => {
  it("is the entry behind the weakest badge, so its sheet names the field in doubt", () => {
    const stale = entry({ freshness: "stale", source_name: "Old notice board" });
    const trust = { opening_schedule: entry({}), closure_rules_i18n: stale };

    expect(weakestTrustEntry(trust)).toBe(stale);
  });

  it("prefers a conflict over an older but agreed verification", () => {
    const earlier = entry({ confidence: "medium" });
    const conflicted = entry({ conflict_flag: true });

    expect(weakestTrustEntry({ a: earlier, b: conflicted })).toBe(conflicted);
  });

  it("has nothing to show when nothing is recorded", () => {
    expect(weakestTrustEntry({})).toBeUndefined();
  });
});
