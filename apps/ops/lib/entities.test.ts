import { describe, expect, it } from "vitest";
import { ageOf, editorPath, entityNoun, labelOf } from "./entities";

describe("labelOf", () => {
  it("prefers English", () => {
    expect(labelOf({ te: "కాశీ", en: "Kashi" }, "kashi")).toBe("Kashi");
  });

  it("falls back to any filled locale before the fallback", () => {
    expect(labelOf({ en: "  ", hi: "काशी" }, "kashi")).toBe("काशी");
  });

  it("never returns a blank", () => {
    expect(labelOf({}, "kashi")).toBe("kashi");
    expect(labelOf(null, "kashi")).toBe("kashi");
    expect(labelOf("not an object", "kashi")).toBe("kashi");
  });
});

describe("entityNoun", () => {
  it("names known tables and humanises unknown ones", () => {
    expect(entityNoun("transport_connections")).toBe("Transport");
    expect(entityNoun("some_new_table")).toBe("some new table");
  });
});

describe("editorPath", () => {
  it("links detail editors by id and list editors by screen", () => {
    expect(editorPath("places", "p1")).toBe("/places/p1");
    expect(editorPath("advisories", "a1")).toBe("/advisories/a1");
    expect(editorPath("phrases", "ph1")).toBe("/phrases/ph1");
    expect(editorPath("phrases", null)).toBe("/phrases");
    expect(editorPath("transport_connections", "t1")).toBe("/transport");
    expect(editorPath("guidance_blocks", "g1")).toBe("/guidance");
  });

  it("returns null for entities with no screen", () => {
    expect(editorPath("availability_rules", "x")).toBeNull();
  });
});

describe("ageOf", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("is null without a timestamp", () => {
    expect(ageOf(null, now)).toBeNull();
  });

  it("reads in the largest sensible unit", () => {
    expect(ageOf("2026-09-13T11:59:30Z", now)).toBe("just now");
    expect(ageOf("2026-09-13T11:15:00Z", now)).toBe("45 minutes");
    expect(ageOf("2026-09-13T11:00:00Z", now)).toBe("1 hour");
    expect(ageOf("2026-09-12T00:00:00Z", now)).toBe("36 hours");
    expect(ageOf("2026-09-01T12:00:00Z", now)).toBe("12 days");
  });

  it("never goes negative for a clock slightly ahead", () => {
    expect(ageOf("2026-09-13T12:05:00Z", now)).toBe("just now");
  });
});
