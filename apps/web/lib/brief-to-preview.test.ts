import { describe, expect, it } from "vitest";

import {
  previewHref,
  strictestMobility,
  structuredFormHref,
  toLocalDateTime,
} from "./brief-to-preview";

describe("strictestMobility", () => {
  it("plans to the most constrained need in the group", () => {
    expect(
      strictestMobility([
        { label: "Amma", mobility: "limited_walking" },
        { label: "Nanna", mobility: "wheelchair" },
        { label: "me", mobility: "full" },
      ]),
    ).toBe("wheelchair");
  });

  it("assumes everyone walks freely only when nobody said otherwise", () => {
    expect(strictestMobility([{ label: "me" }])).toBe("full");
    expect(strictestMobility([])).toBe("full");
  });
});

describe("toLocalDateTime", () => {
  it("keeps a time written without an offset as the traveler wrote it", () => {
    expect(toLocalDateTime("2026-10-16T18:00")).toBe("2026-10-16T18:00");
    expect(toLocalDateTime("2026-10-16T18:00:00")).toBe("2026-10-16T18:00");
  });

  it("reads an instant in the journey's timezone", () => {
    expect(toLocalDateTime("2026-10-16T12:30:00Z")).toBe("2026-10-16T18:00");
    expect(toLocalDateTime("2026-10-16T18:00:00+05:30")).toBe("2026-10-16T18:00");
  });

  it("is null for anything that is not a time, rather than guessing one", () => {
    expect(toLocalDateTime(undefined)).toBeNull();
    expect(toLocalDateTime("evening")).toBeNull();
    expect(toLocalDateTime("2026-10-16")).toBeNull();
  });
});

describe("previewHref", () => {
  it("hands the confirmed brief to the preview, must-do winning over would-like", () => {
    const url = new URL(
      previewHref("te", {
        destinationSlug: "tirumala",
        startDate: "2026-10-14",
        dayCount: 3,
        pace: "relaxed",
        mobility: "limited_walking",
        mustDo: ["e1"],
        wouldLike: ["e1", "e2"],
        returnAt: "2026-10-16T18:00",
      }),
      "http://localhost",
    );

    expect(url.pathname).toBe("/te/plan/preview");
    expect(url.searchParams.getAll("must")).toEqual(["e1"]);
    expect(url.searchParams.getAll("like")).toEqual(["e2"]);
    expect(url.searchParams.get("destination")).toBe("tirumala");
    expect(url.searchParams.get("start")).toBe("2026-10-14");
    expect(url.searchParams.get("days")).toBe("3");
    expect(url.searchParams.get("pace")).toBe("relaxed");
    expect(url.searchParams.get("mobility")).toBe("limited_walking");
    expect(url.searchParams.get("return")).toBe("2026-10-16T18:00");
  });

  it("leaves out what the traveler did not give", () => {
    const url = new URL(
      previewHref("en", {
        destinationSlug: "srisailam",
        startDate: "2026-11-02",
        dayCount: 2,
        mobility: "full",
        mustDo: [],
        wouldLike: [],
        returnAt: null,
      }),
      "http://localhost",
    );

    expect(url.searchParams.has("pace")).toBe(false);
    expect(url.searchParams.has("return")).toBe(false);
    expect(url.searchParams.has("must")).toBe(false);
  });
});

describe("structuredFormHref", () => {
  it("prefills the questions with what is known, and never a start date", () => {
    const url = new URL(
      structuredFormHref("hi", {
        destinationSlug: "tirumala",
        dayCount: 3,
        mobility: "wheelchair",
        mustDo: ["e1"],
      }),
      "http://localhost",
    );

    expect(url.pathname).toBe("/hi/plan");
    expect(url.searchParams.get("destination")).toBe("tirumala");
    expect(url.searchParams.get("mobility")).toBe("wheelchair");
    expect(url.searchParams.getAll("must")).toEqual(["e1"]);
    expect(url.searchParams.has("start")).toBe(false);
  });

  it("is the bare form when nothing is known", () => {
    expect(structuredFormHref("en")).toBe("/en/plan");
  });
});
