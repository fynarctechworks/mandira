import { z } from "zod";
import {
  facilitySubtype,
  i18nText,
  isoDate,
  placeType,
  publishStatus,
  timeRangeTuple,
  uuid,
  weekday,
} from "./primitives";

/**
 * `places.opening_schedule` (TRD §4.4) — a CRITICAL field, so its shape is validated
 * rather than trusted as free-form jsonb. The engine reads this to decide whether an
 * item fits, and a malformed schedule would silently produce a wrong plan.
 *
 *   { "weekly": { "mon": [["06:00","12:00"],["16:00","21:00"]], ... },
 *     "exceptions": [{ "date":"2026-10-12", "hours":[...] | "closed":true, "note_i18n":{} }] }
 */
export const openingScheduleExceptionSchema = z
  .object({
    date: isoDate,
    hours: z.array(timeRangeTuple).optional(),
    closed: z.boolean().optional(),
    note_i18n: i18nText.optional(),
  })
  // An exception says either "closed" or "these hours instead" — both or neither is
  // ambiguous, and the engine would have to guess.
  .refine((e) => (e.closed === true) !== (e.hours !== undefined), {
    message: 'An exception must set either "closed" or "hours", not both',
  });

export const openingScheduleSchema = z.object({
  weekly: z.partialRecord(weekday, z.array(timeRangeTuple)).optional(),
  exceptions: z.array(openingScheduleExceptionSchema).optional(),
});

/** `places.crowd_pattern` — advisory only; the engine does not schedule from it. */
export const crowdPatternSchema = z.partialRecord(
  z.enum(["morning", "midday", "evening"]),
  z.enum(["low", "medium", "high"]),
);

const durationFields = {
  visit_duration_min_minutes: z.number().int().positive().nullish(),
  visit_duration_likely_minutes: z.number().int().positive().nullish(),
  visit_duration_max_minutes: z.number().int().positive().nullish(),
};

/** Mirrors the DB check constraint so a bad range is rejected before it reaches Postgres. */
const durationsOrdered = <T extends z.core.$ZodShape>(schema: z.ZodObject<T>) =>
  schema.refine(
    (v) => {
      const value = v as Record<string, number | null | undefined>;
      const [min, likely, max] = [
        value["visit_duration_min_minutes"],
        value["visit_duration_likely_minutes"],
        value["visit_duration_max_minutes"],
      ];
      if (min == null || likely == null || max == null) return true;
      return min <= likely && likely <= max;
    },
    { message: "Durations must be ordered: min <= likely <= max" },
  );

export const placeInsertSchema = durationsOrdered(
  z.object({
    destination_id: uuid,
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case slug"),
    name_i18n: i18nText,
    place_type: placeType,
    facility_subtype: facilitySubtype.nullish(),
    address: z.string().nullish(),
    summary_i18n: i18nText.optional(),
    // CRITICAL fields (TRD §4.4).
    opening_schedule: openingScheduleSchema.nullish(),
    closure_rules_i18n: i18nText.optional(),
    entry_requirements_i18n: i18nText.optional(),
    dress_code_i18n: i18nText.optional(),
    ...durationFields,
    crowd_pattern: crowdPatternSchema.nullish(),
    hours_note_i18n: i18nText.optional(),
    editorial_weight: z.number().int().min(1).max(5).optional(),
    status: publishStatus.optional(),
  }),
).refine(
  // Mirrors the DB constraint: only a facility carries a facility subtype.
  (v) => v.facility_subtype == null || v.place_type === "facility",
  { message: "facility_subtype is only valid when place_type is 'facility'" },
);

/** Ops edits are partial; `slug` and `destination_id` are not re-assignable here. */
export const placeUpdateSchema = z
  .object({
    name_i18n: i18nText,
    place_type: placeType,
    facility_subtype: facilitySubtype.nullable(),
    address: z.string().nullable(),
    summary_i18n: i18nText,
    opening_schedule: openingScheduleSchema.nullable(),
    closure_rules_i18n: i18nText,
    entry_requirements_i18n: i18nText,
    dress_code_i18n: i18nText,
    visit_duration_min_minutes: z.number().int().positive().nullable(),
    visit_duration_likely_minutes: z.number().int().positive().nullable(),
    visit_duration_max_minutes: z.number().int().positive().nullable(),
    crowd_pattern: crowdPatternSchema.nullable(),
    hours_note_i18n: i18nText,
    editorial_weight: z.number().int().min(1).max(5),
    status: publishStatus,
  })
  .partial();

export type OpeningSchedule = z.infer<typeof openingScheduleSchema>;
export type CrowdPattern = z.infer<typeof crowdPatternSchema>;
export type PlaceInsert = z.infer<typeof placeInsertSchema>;
export type PlaceUpdate = z.infer<typeof placeUpdateSchema>;
