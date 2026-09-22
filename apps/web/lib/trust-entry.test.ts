import { describe, expect, it } from "vitest";

import { trustStateOf, weakestTrustEntry, type TrustEntry } from "./trust";

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

describe("trustStateOf", () => {
  it("drops a verified field to Check locally once its value has been edited", () => {
    // The badge is a claim about the words on the screen. Someone changed them.
    expect(trustStateOf(entry({ needs_reverification: true }))).toBe("check_locally");
  });

  it("leaves a field alone until something actually changes", () => {
    expect(trustStateOf(entry({}))).toBe("verified");
    expect(trustStateOf(entry({ needs_reverification: false }))).toBe("verified");
  });

  it("treats a bundle cached before the flag existed as unchanged, not as suspect", () => {
    // An old offline snapshot predates the question; it is not evidence of an edit.
    const cached: TrustEntry = entry({});
    delete (cached as { needs_reverification?: boolean }).needs_reverification;
    expect(trustStateOf(cached)).toBe("verified");
  });
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

  it("prefers an edited field over one that is merely older", () => {
    const earlier = entry({ confidence: "medium" });
    const changed = entry({ needs_reverification: true });

    expect(weakestTrustEntry({ a: earlier, b: changed })).toBe(changed);
  });

  it("has nothing to show when nothing is recorded", () => {
    expect(weakestTrustEntry({})).toBeUndefined();
  });
});
