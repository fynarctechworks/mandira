import { describe, expect, it } from "vitest";
import { filterPivot, localeProgress, pivotStrings, type UiStringRow } from "./translations";

const rows: UiStringRow[] = [
  { key: "home.title", locale: "en", value: "Plan a journey", status: "confirmed" },
  { key: "home.title", locale: "te", value: "ప్రయాణం", status: "ai_draft" },
  { key: "nav.back", locale: "en", value: "Back", status: "confirmed" },
  { key: "nav.back", locale: "hi", value: "वापस", status: "confirmed" },
  { key: "nav.back", locale: "ta", value: "பின்", status: "confirmed" },
];

describe("pivotStrings", () => {
  it("makes one row per key with a cell for each active locale", () => {
    const pivot = pivotStrings(rows, ["en", "te", "hi"]);
    expect(pivot.map((row) => row.key)).toEqual(["home.title", "nav.back"]);
    expect(pivot[0]?.cells).toEqual({
      en: { value: "Plan a journey", status: "confirmed" },
      te: { value: "ప్రయాణం", status: "ai_draft" },
      hi: null,
    });
  });

  it("ignores values in locales that are not active", () => {
    const pivot = pivotStrings(rows, ["en"]);
    expect(Object.keys(pivot[1]?.cells ?? {})).toEqual(["en"]);
  });
});

describe("filterPivot", () => {
  const pivot = pivotStrings(rows, ["en", "te", "hi"]);

  it("searches keys and values", () => {
    expect(filterPivot(pivot, { q: "NAV", missing: null }).map((r) => r.key)).toEqual(["nav.back"]);
    expect(filterPivot(pivot, { q: "journey", missing: null }).map((r) => r.key)).toEqual([
      "home.title",
    ]);
  });

  it("treats a draft as still missing a translation", () => {
    expect(filterPivot(pivot, { q: "", missing: "te" }).map((r) => r.key)).toEqual([
      "home.title",
      "nav.back",
    ]);
    expect(filterPivot(pivot, { q: "", missing: "hi" }).map((r) => r.key)).toEqual(["home.title"]);
  });
});

describe("localeProgress", () => {
  it("counts confirmed, drafts and missing per locale", () => {
    const pivot = pivotStrings(rows, ["en", "te", "hi"]);
    expect(localeProgress(pivot, ["en", "te", "hi"])).toEqual([
      { code: "en", confirmed: 2, drafts: 0, missing: 0 },
      { code: "te", confirmed: 0, drafts: 1, missing: 1 },
      { code: "hi", confirmed: 1, drafts: 0, missing: 1 },
    ]);
  });
});
