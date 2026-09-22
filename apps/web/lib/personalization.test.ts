import { describe, expect, it } from "vitest";

import {
  affinitiesFrom,
  rankByAffinity,
  SIGNAL_HORIZON_DAYS,
  type Signal,
} from "./personalization";

const NOW = Date.parse("2026-09-23T06:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const signal = (over: Partial<Signal>): Signal => ({
  signal_type: "tier_set",
  entity_table: "experiences",
  entity_id: "e1",
  value: { tier: "protected" },
  created_at: daysAgo(30),
  ...over,
});

describe("affinitiesFrom", () => {
  it("hears what a traveler said by protecting something", () => {
    const [affinity] = [...affinitiesFrom([signal({})], NOW).values()];
    expect(affinity).toEqual({ entityId: "e1", weight: 3, reason: "protected" });
  });

  it("treats marking something OPTIONAL as saying nothing", () => {
    // It is the default a plan lands in. Reading preference into it would be inference.
    expect(affinitiesFrom([signal({ value: { tier: "optional" } })], NOW).size).toBe(0);
  });

  it("counts keeping an item when offered its removal, which is a choice under pressure", () => {
    const [affinity] = [...affinitiesFrom([signal({ signal_type: "item_kept" })], NOW).values()];
    expect(affinity?.weight).toBe(2);
    expect(affinity?.reason).toBe("kept");
  });

  it("lets a removal nudge downward without banning anything", () => {
    const affinities = affinitiesFrom(
      [signal({}), signal({ signal_type: "item_removed", value: null })],
      NOW,
    );
    // Protected 3, removed −1.5: still positive, because dropping something once may have
    // been about time rather than taste.
    expect(affinities.get("e1")?.weight).toBe(1.5);
  });

  it("keeps the strongest reason, not the most recent one", () => {
    const affinities = affinitiesFrom(
      [
        signal({ created_at: daysAgo(200) }),
        signal({ signal_type: "item_removed", value: null, created_at: daysAgo(2) }),
      ],
      NOW,
    );
    expect(affinities.get("e1")?.reason).toBe("protected");
  });

  it("forgets what is older than the horizon, because 'last time' has to mean something", () => {
    expect(
      affinitiesFrom([signal({ created_at: daysAgo(SIGNAL_HORIZON_DAYS + 1) })], NOW).size,
    ).toBe(0);
  });

  it("ignores a signal about nothing in particular", () => {
    expect(affinitiesFrom([signal({ entity_id: null })], NOW).size).toBe(0);
  });
});

describe("rankByAffinity", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const idOf = (item: { id: string }) => item.id;

  it("leaves editorial order alone when the traveler has said nothing", () => {
    const ranked = rankByAffinity(items, idOf, new Map());
    expect(ranked.map((r) => r.item.id)).toEqual(["a", "b", "c"]);
    expect(ranked.every((r) => r.because === null)).toBe(true);
  });

  it("lifts what the traveler protected, and says why", () => {
    const affinities = affinitiesFrom([signal({ entity_id: "c" })], NOW);
    const ranked = rankByAffinity(items, idOf, affinities);

    expect(ranked.map((r) => r.item.id)).toEqual(["c", "a", "b"]);
    expect(ranked[0]?.because).toBe("protected");
  });

  it("does not claim credit for an item that was already first", () => {
    // "Because you protected this" on something that was top anyway is a false explanation.
    const ranked = rankByAffinity(items, idOf, affinitiesFrom([signal({ entity_id: "a" })], NOW));
    expect(ranked[0]?.item.id).toBe("a");
    expect(ranked[0]?.because).toBeNull();
  });

  it("never explains a demotion, which would be a judgement nobody asked for", () => {
    const affinities = affinitiesFrom(
      [signal({ entity_id: "a", signal_type: "item_removed", value: null })],
      NOW,
    );
    const ranked = rankByAffinity(items, idOf, affinities);

    expect(ranked.map((r) => r.item.id)).toEqual(["b", "c", "a"]);
    expect(ranked.every((r) => r.because === null)).toBe(true);
  });

  it("keeps the caller's order among equals, so editorial judgement still decides", () => {
    const affinities = affinitiesFrom(
      [signal({ entity_id: "b" }), signal({ entity_id: "c" })],
      NOW,
    );
    const ranked = rankByAffinity(items, idOf, affinities);

    // b and c both weigh 3; b came first from the editorial ranker and still does.
    expect(ranked.map((r) => r.item.id)).toEqual(["b", "c", "a"]);
  });
});
