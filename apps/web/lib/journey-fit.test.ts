import { describe, expect, it } from "vitest";

import { datesBetween, pickJourneyToFit, rankByJourneyFit } from "./journey-fit";

const journey = (overrides: Record<string, unknown>) => ({
  id: "j",
  status: "upcoming",
  startDate: "2026-10-12",
  endDate: "2026-10-13",
  destinationId: "d1",
  ...overrides,
});

describe("pickJourneyToFit", () => {
  it("prefers the journey under way over any ahead", () => {
    const picked = pickJourneyToFit(
      [
        journey({ id: "soon", startDate: "2026-09-20", endDate: "2026-09-21" }),
        journey({ id: "now", status: "active", startDate: "2026-09-12", endDate: "2026-09-14" }),
      ],
      "2026-09-13",
    );
    expect(picked).toEqual({
      id: "now",
      destinationId: "d1",
      dates: ["2026-09-12", "2026-09-13", "2026-09-14"],
    });
  });

  it("otherwise takes the soonest journey still ahead", () => {
    const picked = pickJourneyToFit(
      [
        journey({ id: "later", startDate: "2026-12-01", endDate: "2026-12-02" }),
        journey({ id: "sooner", startDate: "2026-10-12", endDate: null }),
        journey({ id: "past", startDate: "2026-08-01", endDate: "2026-08-02" }),
      ],
      "2026-09-13",
    );
    expect(picked?.id).toBe("sooner");
    expect(picked?.dates).toEqual(["2026-10-12"]);
  });

  it("fits nothing without a destination and a date, or with only past journeys", () => {
    expect(pickJourneyToFit([journey({ destinationId: null })], "2026-09-13")).toBeNull();
    expect(pickJourneyToFit([journey({ startDate: null })], "2026-09-13")).toBeNull();
    expect(
      pickJourneyToFit([journey({ status: "completed", startDate: "2026-01-01" })], "2026-09-13"),
    ).toBeNull();
  });
});

describe("datesBetween", () => {
  it("covers every day inclusive, and never more than two weeks", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(datesBetween("2026-01-01", "2026-12-31")).toHaveLength(14);
    expect(datesBetween("not-a-date", null)).toEqual([]);
  });
});

describe("rankByJourneyFit", () => {
  it("puts what fits first without dropping or reshuffling anything else", () => {
    const ranked = rankByJourneyFit(
      [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      (result) => result.id === "b" || result.id === "d",
    );
    expect(ranked.map((result) => [result.id, result.fitsJourney])).toEqual([
      ["b", true],
      ["d", true],
      ["a", false],
      ["c", false],
    ]);
  });
});
