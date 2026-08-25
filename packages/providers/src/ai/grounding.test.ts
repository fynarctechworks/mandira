import { describe, expect, it } from "vitest";
import {
  assertGrounded,
  extractClaims,
  groundingHash,
  inputHash,
  isGrounded,
  keepKnownIds,
  NotGroundedError,
} from "./grounding";

describe("extractClaims", () => {
  it("finds times in the forms people write them", () => {
    const claims = extractClaims("Doors at 6:30 AM, aarti at 18:30, and again at 7 pm.");

    expect(claims).toContain("6:30am");
    expect(claims).toContain("18:30");
    expect(claims).toContain("7pm");
  });

  it("finds dates, money and quantities", () => {
    const claims = extractClaims("On 2026-10-12 it costs ₹500 and the walk is 3.1 km.");

    expect(claims).toContain("2026-10-12");
    expect(claims).toContain("₹500");
    expect(claims).toContain("3:1km");
  });

  it("finds nothing in text that claims nothing", () => {
    expect(extractClaims("A quiet morning at the temple, unhurried.")).toEqual([]);
  });
});

describe("assertGrounded", () => {
  const grounding = "Suprabhatam seva runs 03:00–04:30. Advance booking opens 60 days before.";

  it("accepts output whose every claim is in the grounding", () => {
    expect(() =>
      assertGrounded("Suprabhatam is at 03:00, and booking opens 60 days ahead.", grounding),
    ).not.toThrow();
  });

  it("rejects a timing the grounding never mentioned", () => {
    expect(() => assertGrounded("Suprabhatam is at 05:15.", grounding)).toThrow(NotGroundedError);
  });

  it("names what was invented, so the caller can log which claim failed", () => {
    try {
      assertGrounded("It costs ₹250 and starts at 03:00.", grounding);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(NotGroundedError);
      expect((error as NotGroundedError).offending).toEqual(["₹250"]);
      expect((error as NotGroundedError).code).toBe("not_grounded");
    }
  });

  it("accepts a claim the model rephrased rather than invented", () => {
    // A false positive costs a duller sentence; a false negative costs a closed gate. But
    // rejecting a true fact because it was written "6.30pm" instead of "6:30 PM" is neither.
    expect(isGrounded("Doors open at 6.30pm.", "Doors open at 6:30 PM.")).toBe(true);
    expect(isGrounded("It takes 45 mins.", "It takes 45 minutes.")).toBe(true);
    expect(isGrounded("It costs Rs 500.", "It costs ₹500.")).toBe(true);
    expect(isGrounded("Book 60 days ahead.", "Booking opens 60 days before.")).toBe(true);
  });

  it("passes text that makes no factual claim at all", () => {
    expect(isGrounded("It is a peaceful place to spend a morning.", "")).toBe(true);
  });
});

describe("keepKnownIds", () => {
  const candidates = [{ id: "e1" }, { id: "e2" }];

  it("keeps only ids from the candidate list", () => {
    const { kept, rejected } = keepKnownIds(
      [{ experienceId: "e1" }, { experienceId: "invented" }, { experienceId: "e2" }],
      candidates,
    );

    expect(kept.map((k) => k.experienceId)).toEqual(["e1", "e2"]);
    expect(rejected).toEqual(["invented"]);
  });

  it("rejects everything when there are no candidates", () => {
    // No published knowledge means no valid answer, not a free pass (PRD-INT-005).
    const { kept, rejected } = keepKnownIds([{ experienceId: "e1" }], []);

    expect(kept).toEqual([]);
    expect(rejected).toEqual(["e1"]);
  });
});

describe("groundingHash", () => {
  it("is stable regardless of candidate order", () => {
    const a = groundingHash({ candidates: [{ id: "b" }, { id: "a" }], locale: "en" });
    const b = groundingHash({ candidates: [{ id: "a" }, { id: "b" }], locale: "en" });

    expect(a).toBe(b);
  });

  it("changes when the published knowledge changes", () => {
    // This is what stops a cached answer outliving the facts it was grounded in.
    const before = groundingHash({ candidates: [{ id: "a" }], locale: "en" });
    const after = groundingHash({ candidates: [{ id: "a" }, { id: "new" }], locale: "en" });

    expect(after).not.toBe(before);
  });

  it("separates locales, so a Telugu answer is never served to an English request", () => {
    expect(groundingHash({ candidates: [{ id: "a" }], locale: "en" })).not.toBe(
      groundingHash({ candidates: [{ id: "a" }], locale: "te" }),
    );
  });
});

describe("inputHash", () => {
  it("ignores casing and surrounding space", () => {
    expect(inputHash("  Three days in Tirumala  ")).toBe(inputHash("three days in tirumala"));
  });

  it("separates different questions", () => {
    expect(inputHash("three days")).not.toBe(inputHash("four days"));
  });
});
