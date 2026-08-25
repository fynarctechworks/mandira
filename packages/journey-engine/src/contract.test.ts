import type { Enums, Tables } from "@mandhira/db";
import { describe, expectTypeOf, it } from "vitest";
import type {
  AvailabilityKind,
  AgeBand,
  JourneyItemType,
  Mobility,
  PriorityTier,
  TravelMode,
} from "./types";

/**
 * The engine declares its own types (ARCHITECTURE §3: zero imports from the database), so
 * they could drift from the rows the app actually loads. These compile-time assertions
 * pin the parts that must not drift.
 *
 * What is NOT asserted, deliberately: whole-row assignability. The database types every
 * jsonb column as `Json` — an opening schedule is `Json`, not `OpeningSchedule` — so a row
 * does not structurally satisfy the engine's shapes and never will. Those columns are
 * parsed and validated at the boundary by the Zod schemas in `@mandhira/db` (B-005); the
 * engine receives already-validated data. Asserting whole-row compatibility would force
 * the engine to accept `Json` everywhere, which would delete exactly the typing that makes
 * it safe.
 *
 * The enums below are different: they are shared vocabulary, they drive branching, and a
 * silent divergence would change scheduling without any error.
 *
 * `@mandhira/db` is a devDependency only; the engine's source imports nothing from it.
 */
describe("engine vocabulary matches the database enums", () => {
  it("priority tiers drive the option ladder and must match exactly", () => {
    expectTypeOf<Enums<"priority_tier_enum">>().toEqualTypeOf<PriorityTier>();
  });

  it("journey item types match", () => {
    expectTypeOf<Enums<"journey_item_type_enum">>().toEqualTypeOf<JourneyItemType>();
  });

  it("availability kinds match, since each implies a different payload", () => {
    expectTypeOf<Enums<"availability_kind_enum">>().toEqualTypeOf<AvailabilityKind>();
  });

  it("travel modes match", () => {
    expectTypeOf<Enums<"travel_mode_enum">>().toEqualTypeOf<TravelMode>();
  });

  it("mobility and age band match — they size every buffer", () => {
    expectTypeOf<Enums<"mobility_enum">>().toEqualTypeOf<Mobility>();
    expectTypeOf<Enums<"age_band_enum">>().toEqualTypeOf<AgeBand>();
  });
});

describe("scalar columns the engine reads keep their types", () => {
  it("reads day_index and sort_order as numbers", () => {
    expectTypeOf<Tables<"journey_items">["day_index"]>().toEqualTypeOf<number>();
    expectTypeOf<Tables<"journey_items">["sort_order"]>().toEqualTypeOf<number>();
  });

  it("reads the journey's timezone and day window as strings", () => {
    expectTypeOf<Tables<"journeys">["timezone"]>().toEqualTypeOf<string>();
    expectTypeOf<Tables<"journeys">["day_start_time"]>().toEqualTypeOf<string>();
    expectTypeOf<Tables<"journeys">["day_end_time"]>().toEqualTypeOf<string>();
  });

  it("reads availability priority as a number", () => {
    expectTypeOf<Tables<"availability_rules">["priority"]>().toEqualTypeOf<number>();
  });

  it("reads durations as nullable numbers, so absence is representable", () => {
    // A missing duration means "cannot be placed", which the engine reports rather than
    // guessing — so the null must survive into its types.
    expectTypeOf<Tables<"experiences">["duration_likely_minutes"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Tables<"places">["visit_duration_likely_minutes"]>().toEqualTypeOf<
      number | null
    >();
  });
});
