"use server";

import { availabilityRuleInsertSchema, i18nText, uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asRow, opsAction } from "@/lib/action";

/**
 * Experience and availability write paths (O04, OPS-EDIT-03).
 *
 * `advance_booking_required` / `advance_booking_how_i18n` are CRITICAL fields, and EVERY
 * availability rule is critical (TRD §4.4) — the engine schedules against them, so a wrong
 * rule produces a wrong plan rather than a cosmetic glitch.
 *
 * The availability schema is imported from `@mandhira/db` rather than restated here: it
 * already refuses a kind without its matching payload, and one definition means the form,
 * the action and any future importer cannot disagree.
 */

const experienceType = z.enum([
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

const experienceFields = {
  destination_id: uuid,
  place_id: uuid.nullish(),
  route_id: uuid.nullish(),
  slug: z
    .string()
    .min(1, "A slug is required")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens"),
  name_i18n: i18nText.refine(
    (v) => Object.keys(v).length > 0,
    "Add a name in at least one language",
  ),
  experience_type: experienceType,
  significance_i18n: i18nText.default({}),
  description_i18n: i18nText.default({}),
  duration_min_minutes: z.number().int().positive().max(1440).nullish(),
  duration_likely_minutes: z.number().int().positive().max(1440).nullish(),
  duration_max_minutes: z.number().int().positive().max(1440).nullish(),
  advance_booking_required: z.boolean().default(false),
  advance_booking_how_i18n: i18nText.default({}),
  advance_booking_opens_days_before: z.number().int().nonnegative().max(730).nullish(),
  eligibility_i18n: i18nText.default({}),
  cost_note_i18n: i18nText.default({}),
  queue_expectation_i18n: i18nText.default({}),
  preparation_i18n: i18nText.default({}),
  is_outdoor: z.boolean().default(false),
  editorial_weight: z.number().int().min(1).max(5).default(3),
};

const withRules = <T extends z.ZodObject<z.core.$ZodShape>>(schema: T) =>
  schema
    .refine((v) => (v["place_id"] != null) !== (v["route_id"] != null), {
      message: "Anchor this experience to exactly one place or route",
      path: ["place_id"],
    })
    .refine(
      (v) => {
        const min = v["duration_min_minutes"] as number | null | undefined;
        const likely = v["duration_likely_minutes"] as number | null | undefined;
        const max = v["duration_max_minutes"] as number | null | undefined;
        if (min == null || likely == null || max == null) return true;
        return min <= likely && likely <= max;
      },
      { message: "Durations must run shortest to longest", path: ["duration_likely_minutes"] },
    )
    .refine(
      // PRD F7: telling a traveler a booking is required without telling them how is a
      // dead end, and it is exactly the case that generates a Prepare task.
      (v) =>
        !v["advance_booking_required"] ||
        Object.keys((v["advance_booking_how_i18n"] ?? {}) as object).length > 0,
      {
        message: "Explain how to book when advance booking is required",
        path: ["advance_booking_how_i18n"],
      },
    );

const createSchema = withRules(z.object(experienceFields));
const updateSchema = withRules(z.object({ id: uuid, ...experienceFields }));

function toRow(input: Record<string, unknown>) {
  const rest = { ...input };
  delete rest["id"];
  return {
    ...rest,
    place_id: (rest["place_id"] as string | null) ?? null,
    route_id: (rest["route_id"] as string | null) ?? null,
  };
}

export const createExperience = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: createSchema,
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("experiences")
      .insert(asRow(toRow(input as Record<string, unknown>)))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/experiences");
    return { id: data.id };
  },
});

export const updateExperience = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: updateSchema,
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from("experiences")
      .update(asRow(toRow(input as Record<string, unknown>)))
      .eq("id", input.id);
    if (error) throw error;

    revalidatePath("/experiences");
    revalidatePath(`/experiences/${input.id}`);
    return { id: input.id };
  },
});

// ── Availability rules ───────────────────────────────────────────────────────

export const addAvailabilityRule = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: availabilityRuleInsertSchema,
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("availability_rules")
      .insert(asRow(input))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath(`/experiences/${input.experience_id}`);
    return { id: data.id };
  },
});

export const deleteAvailabilityRule = opsAction({
  roles: ["editor", "admin"],
  input: z.object({ id: uuid, experience_id: uuid }),
  handler: async ({ input, supabase }) => {
    // A hard delete is right here: an availability rule carries no history worth keeping
    // once it is wrong, and leaving a stale rule in place would let the engine schedule
    // against it.
    // Through SQL (0042): RLS keeps hard deletes for admins, so an editor's delete used to
    // match nothing and report success, leaving the wrong rule for the engine to schedule by.
    const { error } = await supabase.rpc("delete_knowledge_row", {
      p_table: "availability_rules",
      p_id: input.id,
    });
    if (error) throw error;

    revalidatePath(`/experiences/${input.experience_id}`);
    return { id: input.id };
  },
});
