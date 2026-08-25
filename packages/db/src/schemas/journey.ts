import { z } from "zod";
import {
  isoDate,
  journeyItemType,
  journeyStatus,
  pace,
  priorityTier,
  timeOfDay,
  travelMode,
  uuid,
} from "./primitives";

export const journeyCreateSchema = z
  .object({
    title: z.string().min(1).max(120).nullish(),
    start_date: isoDate.nullish(),
    end_date: isoDate.nullish(),
    timezone: z.string().min(1).optional(),
    day_start_time: timeOfDay.optional(),
    day_end_time: timeOfDay.optional(),
    pace: pace.optional(),
    structure: z.enum(["structured", "flexible"]).optional(),
    walking_tolerance: z.enum(["low", "medium", "high"]).nullish(),
    transport_preference: z
      .enum(["own_vehicle", "public", "hired", "walk_where_possible"])
      .nullish(),
    device_draft_id: z.string().min(1).nullish(),
  })
  .refine((v) => v.start_date == null || v.end_date == null || v.start_date <= v.end_date, {
    message: "start_date must not be after end_date",
    path: ["end_date"],
  })
  .refine(
    (v) => v.day_start_time == null || v.day_end_time == null || v.day_start_time < v.day_end_time,
    {
      message: "day_start_time must be before day_end_time",
      path: ["day_end_time"],
    },
  );

export const journeyUpdateSchema = z
  .object({
    title: z.string().min(1).max(120).nullable(),
    status: journeyStatus,
    start_date: isoDate.nullable(),
    end_date: isoDate.nullable(),
    timezone: z.string().min(1),
    day_start_time: timeOfDay,
    day_end_time: timeOfDay,
    pace,
    structure: z.enum(["structured", "flexible"]),
    walking_tolerance: z.enum(["low", "medium", "high"]).nullable(),
    transport_preference: z
      .enum(["own_vehicle", "public", "hired", "walk_where_possible"])
      .nullable(),
    active_day_index: z.number().int().nonnegative().nullable(),
  })
  .partial();

/**
 * `journey_items` (TRD §4.6).
 *
 * The `fixed` tier requires `fixed_start_at`: a FIXED item is the return guard's anchor
 * (PRD-PLAN-006), and one without a time cannot be honoured. The database enforces this
 * too — this refinement exists so the API rejects it with a readable message rather than
 * surfacing a constraint violation.
 */
export const journeyItemInsertSchema = z
  .object({
    day_index: z.number().int().nonnegative().optional(),
    sort_order: z.number().int().nonnegative().optional(),
    item_type: journeyItemType,
    tier: priorityTier.optional(),
    title_override: z.string().min(1).max(200).nullish(),
    experience_id: uuid.nullish(),
    place_id: uuid.nullish(),
    route_id: uuid.nullish(),
    transport_connection_id: uuid.nullish(),
    fixed_start_at: z.string().datetime({ offset: true }).nullish(),
    fixed_end_at: z.string().datetime({ offset: true }).nullish(),
    preferred_window_start: timeOfDay.nullish(),
    preferred_window_end: timeOfDay.nullish(),
    duration_likely_minutes: z.number().int().positive().nullish(),
    duration_max_minutes: z.number().int().positive().nullish(),
    travel_mode: travelMode.nullish(),
    buffer_minutes: z.number().int().nonnegative().optional(),
    note: z.string().max(1000).nullish(),
  })
  .refine((v) => v.tier !== "fixed" || v.fixed_start_at != null, {
    message: "A FIXED item needs fixed_start_at — it is the anchor the return guard uses",
    path: ["fixed_start_at"],
  })
  .refine(
    (v) => v.fixed_start_at == null || v.fixed_end_at == null || v.fixed_start_at <= v.fixed_end_at,
    { message: "fixed_start_at must not be after fixed_end_at", path: ["fixed_end_at"] },
  )
  .refine(
    (v) =>
      v.preferred_window_start == null ||
      v.preferred_window_end == null ||
      v.preferred_window_start < v.preferred_window_end,
    {
      message: "preferred_window_start must be before preferred_window_end",
      path: ["preferred_window_end"],
    },
  );

export const journeyItemUpdateSchema = z
  .object({
    day_index: z.number().int().nonnegative(),
    sort_order: z.number().int().nonnegative(),
    tier: priorityTier,
    title_override: z.string().min(1).max(200).nullable(),
    fixed_start_at: z.string().datetime({ offset: true }).nullable(),
    fixed_end_at: z.string().datetime({ offset: true }).nullable(),
    preferred_window_start: timeOfDay.nullable(),
    preferred_window_end: timeOfDay.nullable(),
    duration_likely_minutes: z.number().int().positive().nullable(),
    duration_max_minutes: z.number().int().positive().nullable(),
    travel_mode: travelMode.nullable(),
    buffer_minutes: z.number().int().nonnegative(),
    note: z.string().max(1000).nullable(),
  })
  .partial();

/** Item lifecycle in Live mode (PRD F8). */
export const journeyItemStatusSchema = z.object({
  status: z.enum(["planned", "in_progress", "done", "skipped", "moved"]),
  at: z.string().datetime({ offset: true }),
});

/** Drag-and-drop result for one day (TRD §5.2 `POST /api/journeys/:id/reorder`). */
export const journeyReorderSchema = z.object({
  dayIndex: z.number().int().nonnegative(),
  orderedItemIds: z.array(uuid).min(1),
});

export type JourneyCreate = z.infer<typeof journeyCreateSchema>;
export type JourneyUpdate = z.infer<typeof journeyUpdateSchema>;
export type JourneyItemInsert = z.infer<typeof journeyItemInsertSchema>;
export type JourneyItemUpdate = z.infer<typeof journeyItemUpdateSchema>;
export type JourneyItemStatus = z.infer<typeof journeyItemStatusSchema>;
export type JourneyReorder = z.infer<typeof journeyReorderSchema>;
