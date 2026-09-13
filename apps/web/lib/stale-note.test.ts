import { criticalFieldsFor } from "@mandhira/db";
import { describe, expect, it } from "vitest";

import { staleNoteFor, staleNoteKey } from "./stale-note";
import type { TrustEntry } from "./trust";

const NOW = new Date("2026-09-13T00:00:00Z");

const entry = (freshness: TrustEntry["freshness"], verifiedAt: string | null): TrustEntry => ({
  confidence: "medium",
  freshness,
  verified_at: verifiedAt,
  valid_until: null,
  source_name: "Temple trust",
  source_tier_label: "T2",
  conflict_flag: false,
});

const named = (table: string) => criticalFieldsFor(table).find((entry) => entry.field)!.field!;
const placeCritical = named("places");
const experienceCritical = named("experiences");

describe("staleNoteFor", () => {
  it("says how long ago the oldest stale critical field was confirmed", () => {
    const note = staleNoteFor(
      { experience_id: "e1", place_id: "p1" },
      {
        e1: { [experienceCritical]: entry("stale", "2026-02-01T00:00:00Z") },
        p1: { [placeCritical]: entry("stale", "2025-12-01T00:00:00Z") },
      },
      NOW,
    );

    expect(note).toEqual({
      entityId: "p1",
      field: placeCritical,
      verifiedAt: "2025-12-01T00:00:00Z",
      months: 9,
    });
  });

  it("stays quiet about fresh or ageing information, and about fields a plan does not depend on", () => {
    expect(
      staleNoteFor(
        { place_id: "p1" },
        {
          p1: {
            [placeCritical]: entry("aging", "2026-05-01T00:00:00Z"),
            summary_i18n: entry("stale", "2024-01-01T00:00:00Z"),
          },
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("stays quiet when nothing is known about the item", () => {
    expect(staleNoteFor({ experience_id: "e9" }, {}, NOW)).toBeNull();
    expect(staleNoteFor({}, {}, NOW)).toBeNull();
  });

  it("never says less than a month", () => {
    const note = staleNoteFor(
      { place_id: "p1" },
      { p1: { [placeCritical]: entry("stale", "2026-09-01T00:00:00Z") } },
      NOW,
    );
    expect(note?.months).toBe(1);
  });
});

describe("staleNoteKey", () => {
  it("changes when the field is confirmed again, so a new staleness is said again", () => {
    const base = { entityId: "p1", field: placeCritical, months: 7 };
    expect(staleNoteKey("i1", { ...base, verifiedAt: "2026-01-01T00:00:00Z" })).not.toBe(
      staleNoteKey("i1", { ...base, verifiedAt: "2026-02-01T00:00:00Z" }),
    );
  });
});
