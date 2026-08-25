import { describe, expect, expectTypeOf, it } from "vitest";
import type { Enums, TablesInsert } from "../types-helpers";
import { availabilityRuleInsertSchema, experienceInsertSchema } from "./experience";
import { journeyItemInsertSchema, journeyReorderSchema } from "./journey";
import { openingScheduleSchema, placeInsertSchema } from "./place";
import type {
  availabilityKind,
  experienceType,
  healthState,
  journeyItemType,
  placeType,
  priorityTier,
  publishStatus,
  verificationStatus,
} from "./primitives";

const DEST = "11111111-1111-1111-1111-111111111111";

/** The union of a Zod enum's `options` tuple. */
type Member<T extends readonly unknown[]> = T[number];

/**
 * The enum members here are hand-written, so they can drift from the database.
 * These are compile-time assertions: if a migration changes an enum, `pnpm typecheck`
 * fails in this file rather than a route handler failing at runtime.
 */
describe("enum schemas match the generated database enums", () => {
  // Compare the MEMBER UNION, not the array type: this fails if the schema is missing a
  // value the database has, and also if it invents one the database does not.
  it("pins every enum used by the entity schemas", () => {
    expectTypeOf<Member<typeof publishStatus.options>>().toEqualTypeOf<
      Enums<"publish_status_enum">
    >();
    expectTypeOf<Member<typeof verificationStatus.options>>().toEqualTypeOf<
      Enums<"verification_status_enum">
    >();
    expectTypeOf<Member<typeof placeType.options>>().toEqualTypeOf<Enums<"place_type_enum">>();
    expectTypeOf<Member<typeof experienceType.options>>().toEqualTypeOf<
      Enums<"experience_type_enum">
    >();
    expectTypeOf<Member<typeof availabilityKind.options>>().toEqualTypeOf<
      Enums<"availability_kind_enum">
    >();
    expectTypeOf<Member<typeof priorityTier.options>>().toEqualTypeOf<
      Enums<"priority_tier_enum">
    >();
    expectTypeOf<Member<typeof journeyItemType.options>>().toEqualTypeOf<
      Enums<"journey_item_type_enum">
    >();
    expectTypeOf<Member<typeof healthState.options>>().toEqualTypeOf<Enums<"health_state_enum">>();
  });

  it("produces values the generated Insert types accept", () => {
    // If a column is renamed or retyped, this stops compiling.
    expectTypeOf<Enums<"place_type_enum">>().toExtend<TablesInsert<"places">["place_type"]>();
    expectTypeOf<Enums<"priority_tier_enum">>().toExtend<
      NonNullable<TablesInsert<"journey_items">["tier"]>
    >();
  });
});

describe("place schema", () => {
  const valid = {
    destination_id: DEST,
    slug: "main-temple",
    name_i18n: { en: "Main Temple", te: "ప్రధాన ఆలయం" },
    place_type: "temple" as const,
  };

  it("accepts a minimal valid place", () => {
    expect(placeInsertSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-kebab-case slug", () => {
    expect(placeInsertSchema.safeParse({ ...valid, slug: "Main Temple" }).success).toBe(false);
  });

  it("allows any locale key, so adding a locale needs no schema change", () => {
    const result = placeInsertSchema.safeParse({
      ...valid,
      name_i18n: { en: "Main Temple", ta: "முதன்மை கோவில்" },
    });
    expect(result.success).toBe(true);
  });

  it("mirrors the DB rule that facility_subtype needs a facility", () => {
    expect(placeInsertSchema.safeParse({ ...valid, facility_subtype: "restroom" }).success).toBe(
      false,
    );
    expect(
      placeInsertSchema.safeParse({
        ...valid,
        place_type: "facility",
        facility_subtype: "restroom",
      }).success,
    ).toBe(true);
  });

  it("rejects an out-of-order duration triple", () => {
    const result = placeInsertSchema.safeParse({
      ...valid,
      visit_duration_min_minutes: 90,
      visit_duration_likely_minutes: 60,
      visit_duration_max_minutes: 30,
    });
    expect(result.success).toBe(false);
  });
});

describe("opening_schedule shape (critical field)", () => {
  it("accepts a weekly schedule with split hours", () => {
    const result = openingScheduleSchema.safeParse({
      weekly: {
        mon: [
          ["06:00", "12:00"],
          ["16:00", "21:00"],
        ],
        tue: [["06:00", "21:00"]],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed time", () => {
    expect(openingScheduleSchema.safeParse({ weekly: { mon: [["6am", "12:00"]] } }).success).toBe(
      false,
    );
    expect(openingScheduleSchema.safeParse({ weekly: { mon: [["25:00", "26:00"]] } }).success).toBe(
      false,
    );
  });

  it("accepts a closure exception and an hours exception", () => {
    expect(
      openingScheduleSchema.safeParse({
        exceptions: [{ date: "2026-10-12", closed: true, note_i18n: { en: "Festival" } }],
      }).success,
    ).toBe(true);
    expect(
      openingScheduleSchema.safeParse({
        exceptions: [{ date: "2026-10-12", hours: [["05:00", "23:00"]] }],
      }).success,
    ).toBe(true);
  });

  it("rejects an exception that is both closed and has hours, or neither", () => {
    expect(
      openingScheduleSchema.safeParse({
        exceptions: [{ date: "2026-10-12", closed: true, hours: [["05:00", "23:00"]] }],
      }).success,
    ).toBe(false);
    expect(openingScheduleSchema.safeParse({ exceptions: [{ date: "2026-10-12" }] }).success).toBe(
      false,
    );
  });
});

describe("experience schema", () => {
  const valid = {
    destination_id: DEST,
    place_id: "22222222-2222-2222-2222-222222222222",
    slug: "morning-darshan",
    name_i18n: { en: "Morning darshan" },
    experience_type: "darshan" as const,
  };

  it("requires exactly one anchor", () => {
    expect(experienceInsertSchema.safeParse(valid).success).toBe(true);
    expect(
      experienceInsertSchema.safeParse({ ...valid, place_id: null, route_id: null }).success,
    ).toBe(false);
    expect(
      experienceInsertSchema.safeParse({
        ...valid,
        route_id: "33333333-3333-3333-3333-333333333333",
      }).success,
    ).toBe(false);
  });

  it("will not let advance booking be required without saying how", () => {
    const result = experienceInsertSchema.safeParse({
      ...valid,
      advance_booking_required: true,
    });
    expect(result.success).toBe(false);

    expect(
      experienceInsertSchema.safeParse({
        ...valid,
        advance_booking_required: true,
        advance_booking_how_i18n: { en: "Book on the temple website 60 days ahead." },
      }).success,
    ).toBe(true);
  });
});

describe("availability rules (every row is critical)", () => {
  const base = { experience_id: DEST };

  it("requires the payload its kind implies", () => {
    expect(
      availabilityRuleInsertSchema.safeParse({ ...base, kind: "daily_fixed_times" }).success,
    ).toBe(false);
    expect(
      availabilityRuleInsertSchema.safeParse({
        ...base,
        kind: "daily_fixed_times",
        daily_times: [{ start: "06:00", end: "07:30" }],
      }).success,
    ).toBe(true);

    expect(availabilityRuleInsertSchema.safeParse({ ...base, kind: "date_range" }).success).toBe(
      false,
    );
    expect(
      availabilityRuleInsertSchema.safeParse({
        ...base,
        kind: "date_range",
        date_start: "2026-10-01",
        date_end: "2026-10-10",
      }).success,
    ).toBe(true);
  });

  it("needs no payload for kinds that carry none", () => {
    expect(
      availabilityRuleInsertSchema.safeParse({ ...base, kind: "always_during_opening" }).success,
    ).toBe(true);
    expect(availabilityRuleInsertSchema.safeParse({ ...base, kind: "on_request" }).success).toBe(
      true,
    );
  });

  it("rejects an inverted window and an inverted date range", () => {
    expect(
      availabilityRuleInsertSchema.safeParse({
        ...base,
        kind: "daily_fixed_times",
        daily_times: [{ start: "19:00", end: "06:00" }],
      }).success,
    ).toBe(false);

    expect(
      availabilityRuleInsertSchema.safeParse({
        ...base,
        kind: "date_range",
        date_start: "2026-10-10",
        date_end: "2026-10-01",
      }).success,
    ).toBe(false);
  });
});

describe("journey item schema", () => {
  it("requires a time on a FIXED item — the return guard's anchor", () => {
    const result = journeyItemInsertSchema.safeParse({
      item_type: "fixed_commitment",
      tier: "fixed",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["fixed_start_at"]);
    }

    expect(
      journeyItemInsertSchema.safeParse({
        item_type: "fixed_commitment",
        tier: "fixed",
        fixed_start_at: "2026-10-12T06:30:00+05:30",
      }).success,
    ).toBe(true);
  });

  it("does not demand a time from other tiers", () => {
    expect(
      journeyItemInsertSchema.safeParse({ item_type: "experience", tier: "protected" }).success,
    ).toBe(true);
  });

  it("rejects an inverted preferred window", () => {
    expect(
      journeyItemInsertSchema.safeParse({
        item_type: "experience",
        preferred_window_start: "18:00",
        preferred_window_end: "09:00",
      }).success,
    ).toBe(false);
  });

  it("requires at least one item id when reordering a day", () => {
    expect(journeyReorderSchema.safeParse({ dayIndex: 0, orderedItemIds: [] }).success).toBe(false);
    expect(journeyReorderSchema.safeParse({ dayIndex: 0, orderedItemIds: [DEST] }).success).toBe(
      true,
    );
  });
});
