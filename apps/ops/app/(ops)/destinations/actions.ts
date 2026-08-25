"use server";

import { i18nText, uuid } from "@mandhira/db";
import { getGeocodingProvider } from "@mandhira/providers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";

/**
 * Destination write paths (O02, OPS-EDIT-01).
 *
 * Drafting is researcher/editor work; `status` is deliberately absent from these schemas.
 * Moving a destination to `published` is the approve workflow (B-012), not a field an
 * editor can set from a form — the publish gate exists precisely so that publication is a
 * decision with a check behind it.
 */

const destinationFields = {
  slug: z
    .string()
    .min(1, "A slug is required")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens"),
  name_i18n: i18nText.refine(
    (v) => Object.keys(v).length > 0,
    "Add a name in at least one language",
  ),
  region: z.string().max(120).nullish(),
  state: z.string().max(120).nullish(),
  country: z.string().length(2).default("IN"),
  overview_i18n: i18nText.default({}),
  best_seasons_i18n: i18nText.default({}),
  seasonal_notes_i18n: i18nText.default({}),
  radius_km: z.number().positive().max(200).default(5),
  editorial_weight: z.number().int().min(1).max(5).default(3),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
};

const createSchema = z.object(destinationFields).refine(
  // A centre is either fully set or not set: one coordinate alone is meaningless and
  // would produce a broken PostGIS point.
  (v) => (v.latitude == null) === (v.longitude == null),
  { message: "Set both latitude and longitude, or neither", path: ["latitude"] },
);

const updateSchema = z
  .object({ id: uuid, ...destinationFields })
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    message: "Set both latitude and longitude, or neither",
    path: ["latitude"],
  });

/** PostGIS geography column; WKT is the simplest thing PostgREST will accept. */
function toPoint(latitude?: number | null, longitude?: number | null): string | null {
  if (latitude == null || longitude == null) return null;
  return `SRID=4326;POINT(${longitude} ${latitude})`;
}

function toRow(input: z.infer<typeof createSchema>) {
  const { latitude, longitude, ...rest } = input;
  return {
    ...rest,
    region: rest.region ?? null,
    state: rest.state ?? null,
    centre: toPoint(latitude, longitude),
  };
}

export const createDestination = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: createSchema,
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("destinations")
      .insert(toRow(input))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/destinations");
    return { id: data.id };
  },
});

export const updateDestination = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: updateSchema,
  handler: async ({ input, supabase }) => {
    const { id, ...fields } = input;
    const { error } = await supabase.from("destinations").update(toRow(fields)).eq("id", id);
    if (error) throw error;

    revalidatePath("/destinations");
    revalidatePath(`/destinations/${id}`);
    return { id };
  },
});

/**
 * Soft delete (TRD §1.4). The row stays for history and for anything already referencing
 * it; `deleted_at` removes it from the published views and from Ops lists.
 */
export const archiveDestination = opsAction({
  roles: ["editor", "admin"],
  input: z.object({ id: uuid }),
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from("destinations")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) throw error;

    revalidatePath("/destinations");
    return { id: input.id };
  },
});

/** Forward geocoding for the centre picker. Ops-only, and rate-limited in the provider. */
export const searchPlaces = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: z.object({ query: z.string().min(3).max(200), country: z.string().length(2).optional() }),
  handler: async ({ input }) => {
    const results = await getGeocodingProvider().search(input.query, {
      limit: 5,
      ...(input.country ? { countryCodes: [input.country.toLowerCase()] } : {}),
    });
    return { results };
  },
});
