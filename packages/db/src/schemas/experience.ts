import { z } from "zod";
import {
  availabilityKind,
  experienceType,
  i18nText,
  isoDate,
  publishStatus,
  timeWindow,
  uuid,
  weekday,
} from "./primitives";

export const experienceInsertSchema = z
  .object({
    destination_id: uuid,
    place_id: uuid.nullish(),
    route_id: uuid.nullish(),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case slug"),
    name_i18n: i18nText,
    experience_type: experienceType,
    significance_i18n: i18nText.optional(),
    description_i18n: i18nText.optional(),
    duration_min_minutes: z.number().int().positive().nullish(),
    duration_likely_minutes: z.number().int().positive().nullish(),
    duration_max_minutes: z.number().int().positive().nullish(),
    // CRITICAL fields (TRD §4.4).
    advance_booking_required: z.boolean().optional(),
    advance_booking_how_i18n: i18nText.optional(),
    advance_booking_opens_days_before: z.number().int().nonnegative().nullish(),
    eligibility_i18n: i18nText.optional(),
    cost_note_i18n: i18nText.optional(),
    queue_expectation_i18n: i18nText.optional(),
    preparation_i18n: i18nText.optional(),
    is_outdoor: z.boolean().optional(),
    editorial_weight: z.number().int().min(1).max(5).optional(),
    status: publishStatus.optional(),
  })
  // Mirrors the DB constraint: an experience anchors to exactly one of place or route.
  .refine((v) => (v.place_id != null) !== (v.route_id != null), {
    message: "An experience must reference exactly one of place_id or route_id",
  })
  .refine(
    (v) => {
      const { duration_min_minutes: min, duration_likely_minutes: likely } = v;
      const max = v.duration_max_minutes;
      if (min == null || likely == null || max == null) return true;
      return min <= likely && likely <= max;
    },
    { message: "Durations must be ordered: min <= likely <= max" },
  )
  .refine(
    // PRD F7: "advance booking required" without telling the traveler HOW is a dead end,
    // and it is exactly the case that generates a Prepare task.
    (v) =>
      !v.advance_booking_required ||
      (v.advance_booking_how_i18n != null && Object.keys(v.advance_booking_how_i18n).length > 0),
    {
      message: "advance_booking_how_i18n is required when advance_booking_required is true",
      path: ["advance_booking_how_i18n"],
    },
  );

export const experienceUpdateSchema = z
  .object({
    name_i18n: i18nText,
    experience_type: experienceType,
    significance_i18n: i18nText,
    description_i18n: i18nText,
    duration_min_minutes: z.number().int().positive().nullable(),
    duration_likely_minutes: z.number().int().positive().nullable(),
    duration_max_minutes: z.number().int().positive().nullable(),
    advance_booking_required: z.boolean(),
    advance_booking_how_i18n: i18nText,
    advance_booking_opens_days_before: z.number().int().nonnegative().nullable(),
    eligibility_i18n: i18nText,
    cost_note_i18n: i18nText,
    queue_expectation_i18n: i18nText,
    preparation_i18n: i18nText,
    is_outdoor: z.boolean(),
    editorial_weight: z.number().int().min(1).max(5),
    status: publishStatus,
  })
  .partial();

/**
 * `availability_rules` (TRD §4.4). Every row is CRITICAL — this is what the engine
 * schedules against, so the payload shape required by each `kind` is enforced here
 * rather than left to whoever writes the Ops form.
 */
export const availabilityRuleInsertSchema = z
  .object({
    experience_id: uuid,
    kind: availabilityKind,
    daily_times: z.array(timeWindow).nullish(),
    weekly_pattern: z.partialRecord(weekday, z.array(timeWindow)).nullish(),
    date_start: isoDate.nullish(),
    date_end: isoDate.nullish(),
    calendar_dates: z.array(isoDate).nullish(),
    season_label_i18n: i18nText.optional(),
    capacity_note_i18n: i18nText.optional(),
    priority: z.number().int().positive().optional(),
    valid_from: isoDate.nullish(),
    valid_to: isoDate.nullish(),
  })
  .refine(
    (v) => {
      // Each kind needs its own payload present, or the rule says nothing usable.
      switch (v.kind) {
        case "daily_fixed_times":
          return v.daily_times != null && v.daily_times.length > 0;
        case "weekly_pattern":
          return v.weekly_pattern != null && Object.keys(v.weekly_pattern).length > 0;
        case "date_range":
          return v.date_start != null && v.date_end != null;
        case "calendar_dates":
          return v.calendar_dates != null && v.calendar_dates.length > 0;
        case "always_during_opening":
        case "on_request":
          return true;
      }
    },
    { message: "This availability kind requires its matching payload" },
  )
  .refine((v) => v.date_start == null || v.date_end == null || v.date_start <= v.date_end, {
    message: "date_start must not be after date_end",
    path: ["date_end"],
  })
  .refine((v) => v.valid_from == null || v.valid_to == null || v.valid_from <= v.valid_to, {
    message: "valid_from must not be after valid_to",
    path: ["valid_to"],
  });

export type ExperienceInsert = z.infer<typeof experienceInsertSchema>;
export type ExperienceUpdate = z.infer<typeof experienceUpdateSchema>;
export type AvailabilityRuleInsert = z.infer<typeof availabilityRuleInsertSchema>;
