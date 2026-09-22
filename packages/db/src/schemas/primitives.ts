import { z } from "zod";

/**
 * Shared building blocks for the entity schemas.
 *
 * Enum members are transcribed from TRD §4.1 and pinned against the generated
 * database types in `schemas.test.ts`, so a migration that changes an enum breaks
 * typecheck here rather than failing at runtime in a route handler.
 */

/**
 * Postgres `uuid` accepts any 128-bit value in 8-4-4-4-12 hex form — it does not check
 * RFC 4122 version/variant bits. Zod's `z.uuid()` does, and would therefore reject ids
 * the database happily stores (fixture ids, ids minted by other systems). `z.guid()` is
 * the permissive form and is the one that actually mirrors the column type.
 */
export const uuid = z.guid();

/** "HH:MM", 24-hour. Used by opening schedules and availability windows. */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

/** "YYYY-MM-DD". Postgres `date` renders this way over the wire. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/**
 * Translatable text (TRD §1.4): `{ "en": "...", "te": "...", "hi": "..." }`.
 * Keys are not restricted to the launch locales — adding a locale is a data change,
 * not a schema change (D-028), so this must not need editing when one is added.
 */
export const i18nText = z.record(z.string(), z.string());

export const publishStatus = z.enum(["draft", "in_review", "published", "archived"]);

export const verificationStatus = z.enum([
  "unverified",
  "ai_extracted",
  "human_reviewed",
  "verified",
  "disputed",
]);

export const sourceTier = z.enum(["T1", "T2", "T3", "T4", "T5"]);
export const freshness = z.enum(["fresh", "aging", "stale"]);
export const confidence = z.enum(["high", "medium", "low"]);

export const placeType = z.enum([
  "temple",
  "shrine",
  "sacred_site",
  "ghat",
  "viewpoint",
  "facility",
  "transport_point",
  "accommodation",
  "food",
]);

export const facilitySubtype = z.enum([
  "restroom",
  "drinking_water",
  "cloakroom",
  "medical",
  "parking",
  "atm",
  "rest_area",
  "help_desk",
]);

export const experienceType = z.enum([
  "darshan",
  "ritual",
  "aarti",
  "seva",
  "festival",
  "event",
  "walk",
  "cultural",
  "other",
]);

export const availabilityKind = z.enum([
  "always_during_opening",
  "daily_fixed_times",
  "weekly_pattern",
  "date_range",
  "calendar_dates",
  "on_request",
]);

export const travelMode = z.enum(["walk", "vehicle", "public_transport", "hired", "other"]);
export const priorityTier = z.enum(["fixed", "protected", "important", "optional"]);

export const journeyItemType = z.enum([
  "experience",
  "travel_leg",
  "rest",
  "meal",
  "fixed_commitment",
  "free_time",
]);

export const journeyStatus = z.enum(["draft", "upcoming", "active", "completed", "archived"]);
export const healthState = z.enum(["comfortable", "tight", "at_risk", "broken"]);
export const pace = z.enum(["relaxed", "balanced", "full"]);

export const weekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/** A single open window, e.g. ["06:00", "12:00"]. */
export const timeRangeTuple = z.tuple([timeOfDay, timeOfDay]);

/** A named window, the shape availability rules use. */
export const timeWindow = z
  .object({ start: timeOfDay, end: timeOfDay })
  .refine((w) => w.start < w.end, { message: "start must be before end" });

/**
 * The trust bundle each `v_published_*` view attaches (TRD §4.4). Keys are field
 * names, plus "entity" for whole-entity trust.
 *
 * Note there is deliberately no confidence *percentage* — PRD F9 forbids showing one,
 * so the shape never carries one to leak into the UI.
 */
export const trustEntry = z.object({
  confidence,
  freshness,
  verified_at: z.string().nullable(),
  valid_until: z.string().nullable(),
  source_name: z.string().nullable(),
  source_tier_label: z.string().nullable(),
  conflict_flag: z.boolean(),
  /*
   * The value changed after it was verified (0053). Defaulted, because a bundle cached
   * offline before this column existed is still a perfectly good bundle — it simply
   * predates the question, and an absent flag is an honest "not known to have changed".
   */
  needs_reverification: z.boolean().default(false),
});

export const trustBundle = z.record(z.string(), trustEntry);

export type I18nText = z.infer<typeof i18nText>;
export type TimeWindow = z.infer<typeof timeWindow>;
export type TrustEntry = z.infer<typeof trustEntry>;
export type TrustBundle = z.infer<typeof trustBundle>;
