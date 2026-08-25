"use server";

import { crowdPatternSchema, i18nText, openingScheduleSchema, uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";

/**
 * Place write paths (O03, OPS-EDIT-02).
 *
 * `opening_schedule`, `closure_rules_i18n` and `entry_requirements_i18n` are CRITICAL
 * fields (TRD §4.4): a place is invisible to travelers until each carries trust at
 * `human_reviewed` or better (D-030). Editors fill them in here; attaching the trust
 * record is the verification step (B-011).
 */

const placeType = z.enum([
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

const facilitySubtype = z.enum([
  "restroom",
  "drinking_water",
  "cloakroom",
  "medical",
  "parking",
  "atm",
  "rest_area",
  "help_desk",
]);

const placeFields = {
  destination_id: uuid,
  slug: z
    .string()
    .min(1, "A slug is required")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens"),
  name_i18n: i18nText.refine(
    (v) => Object.keys(v).length > 0,
    "Add a name in at least one language",
  ),
  place_type: placeType,
  facility_subtype: facilitySubtype.nullish(),
  address: z.string().max(300).nullish(),
  summary_i18n: i18nText.default({}),
  opening_schedule: openingScheduleSchema.nullish(),
  closure_rules_i18n: i18nText.default({}),
  entry_requirements_i18n: i18nText.default({}),
  dress_code_i18n: i18nText.default({}),
  visit_duration_min_minutes: z.number().int().positive().max(1440).nullish(),
  visit_duration_likely_minutes: z.number().int().positive().max(1440).nullish(),
  visit_duration_max_minutes: z.number().int().positive().max(1440).nullish(),
  crowd_pattern: crowdPatternSchema.nullish(),
  hours_note_i18n: i18nText.default({}),
  editorial_weight: z.number().int().min(1).max(5).default(3),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
};

/** Shared refinements, mirroring the database's own constraints with readable messages. */
const withRules = <T extends z.ZodObject<z.core.$ZodShape>>(schema: T) =>
  schema
    .refine((v) => (v["latitude"] == null) === (v["longitude"] == null), {
      message: "Set both latitude and longitude, or neither",
      path: ["latitude"],
    })
    .refine((v) => v["facility_subtype"] == null || v["place_type"] === "facility", {
      message: "Only a facility can have a facility type",
      path: ["facility_subtype"],
    })
    .refine(
      (v) => {
        const min = v["visit_duration_min_minutes"] as number | null | undefined;
        const likely = v["visit_duration_likely_minutes"] as number | null | undefined;
        const max = v["visit_duration_max_minutes"] as number | null | undefined;
        if (min == null || likely == null || max == null) return true;
        return min <= likely && likely <= max;
      },
      {
        message: "Durations must run shortest to longest",
        path: ["visit_duration_likely_minutes"],
      },
    );

const createSchema = withRules(z.object(placeFields));
const updateSchema = withRules(z.object({ id: uuid, ...placeFields }));

function toRow(input: Record<string, unknown>) {
  // `id` is dropped: it addresses the row, it is not a column to write.
  const { latitude, longitude, ...rest } = input as Record<string, unknown> & {
    latitude?: number | null;
    longitude?: number | null;
  };
  delete rest["id"];
  return {
    ...rest,
    address: (rest["address"] as string | null) ?? null,
    facility_subtype: (rest["facility_subtype"] as string | null) ?? null,
    location:
      latitude == null || longitude == null ? null : `SRID=4326;POINT(${longitude} ${latitude})`,
  };
}

export const createPlace = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: createSchema,
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("places")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row is validated above
      .insert(toRow(input as Record<string, unknown>) as any)
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/places");
    return { id: data.id };
  },
});

export const updatePlace = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: updateSchema,
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from("places")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row is validated above
      .update(toRow(input as Record<string, unknown>) as any)
      .eq("id", input.id);
    if (error) throw error;

    revalidatePath("/places");
    revalidatePath(`/places/${input.id}`);
    return { id: input.id };
  },
});

export const archivePlace = opsAction({
  roles: ["editor", "admin"],
  input: z.object({ id: uuid }),
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from("places")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) throw error;

    revalidatePath("/places");
    return { id: input.id };
  },
});
