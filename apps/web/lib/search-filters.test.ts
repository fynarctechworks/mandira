import { describe, expect, it } from "vitest";

import { searchFiltersFrom } from "./search-filters";

describe("searchFiltersFrom", () => {
  it("is empty for an empty query", () => {
    expect(searchFiltersFrom({})).toEqual({});
  });

  it("reads every filter the bar offers", () => {
    expect(
      searchFiltersFrom({
        type: "aarti",
        access: "step_free",
        duration: "60",
        booking: "no",
        on: "2026-10-12",
        near: "00000000-0000-4000-8000-0000000000c1",
      }),
    ).toEqual({
      type: "aarti",
      stepFreeOnly: true,
      maxDurationMinutes: 60,
      advanceBooking: false,
      availableOn: "2026-10-12",
      nearJourneyId: "00000000-0000-4000-8000-0000000000c1",
    });
  });

  it("ignores values that are not ones it offers", () => {
    expect(
      searchFiltersFrom({
        access: "anything",
        duration: "-5",
        booking: "maybe",
        on: "2026-02-30",
        near: "my-journey",
      }),
    ).toEqual({});
  });
});
