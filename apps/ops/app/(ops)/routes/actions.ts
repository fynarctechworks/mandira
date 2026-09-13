"use server";

import { i18nText, uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asRow, opsAction, requireDrafter } from "@/lib/action";

/**
 * Routes, their stops, transport connections and accessibility records
 * (O05/O06, OPS-EDIT-04/05).
 *
 * `transport_connections.duration_likely_minutes` is a CRITICAL field (TRD §4.4): the
 * engine builds travel legs from it, so a wrong value shifts every downstream item.
 */

const travelMode = z.enum(["walk", "vehicle", "public_transport", "hired", "other"]);
const difficulty = z.enum(["easy", "moderate", "hard"]);

const routeFields = {
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
  mode: travelMode,
  distance_m: z.number().int().nonnegative().max(500_000).nullish(),
  duration_min_minutes: z.number().int().positive().max(1440).nullish(),
  duration_likely_minutes: z.number().int().positive().max(1440).nullish(),
  duration_max_minutes: z.number().int().positive().max(1440).nullish(),
  difficulty: difficulty.nullish(),
  elevation_note_i18n: i18nText.default({}),
};

const orderedDurations = <T extends z.ZodObject<z.core.$ZodShape>>(schema: T) =>
  schema.refine(
    (v) => {
      const min = v["duration_min_minutes"] as number | null | undefined;
      const likely = v["duration_likely_minutes"] as number | null | undefined;
      const max = v["duration_max_minutes"] as number | null | undefined;
      if (min == null || likely == null || max == null) return true;
      return min <= likely && likely <= max;
    },
    { message: "Durations must run shortest to longest", path: ["duration_likely_minutes"] },
  );

export const createRoute = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: orderedDurations(z.object(routeFields)),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("routes")
      .insert(asRow(input))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/routes");
    return { id: data.id };
  },
});

export const updateRoute = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: orderedDurations(z.object({ id: uuid, ...routeFields })),
  handler: async ({ input, supabase }) => {
    const { id, ...fields } = input;
    const { error } = await supabase.from("routes").update(asRow(fields)).eq("id", id);
    if (error) throw error;

    revalidatePath("/routes");
    revalidatePath(`/routes/${id}`);
    return { id };
  },
});

/**
 * Replaces a route's stop list wholesale.
 *
 * Ordering is written from the array index rather than patched per row: a reorder is one
 * intent, and applying it as a series of individual updates leaves the list briefly — or
 * permanently, if one call fails — in an order nobody chose.
 */
export const setRouteStops = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: z.object({
    route_id: uuid,
    stops: z.array(z.object({ place_id: uuid, is_rest_point: z.boolean().default(false) })),
  }),
  handler: async ({ input, supabase }) => {
    // One transaction in SQL (0042). As a delete then an insert from here, the delete
    // needed the admin-only hard delete: for everyone else it removed nothing, and the
    // insert then doubled every stop.
    const { error } = await supabase.rpc("set_route_stops", {
      p_route_id: input.route_id,
      p_stops: input.stops,
    });
    if (error) throw error;

    revalidatePath(`/routes/${input.route_id}`);
    return { count: input.stops.length };
  },
});

// ── Transport connections ────────────────────────────────────────────────────

/*
 * Schemas are declared as their own consts, never inline inside an `opsAction({...})`
 * argument. In a `"use server"` module Next treats every arrow function it finds inside an
 * exported declaration as a Server Action candidate, and a Zod `.refine()` callback is a
 * synchronous arrow — which fails the build with "Server Actions must be async functions".
 */
const transportSchema = z
  .object({
    id: uuid.optional(),
    destination_id: uuid,
    from_place_id: uuid.nullish(),
    to_place_id: uuid.nullish(),
    mode: travelMode,
    duration_likely_minutes: z.number().int().positive().max(2880).nullish(),
    duration_max_minutes: z.number().int().positive().max(2880).nullish(),
    operator: z.string().max(160).nullish(),
    frequency_note_i18n: i18nText.default({}),
    booking_note_i18n: i18nText.default({}),
  })
  .refine((v) => v.from_place_id != null && v.to_place_id != null, {
    message: "Choose both a start and an end",
    path: ["to_place_id"],
  })
  .refine((v) => v.from_place_id !== v.to_place_id, {
    message: "A connection needs two different places",
    path: ["to_place_id"],
  })
  .refine(
    (v) =>
      v.duration_likely_minutes == null ||
      v.duration_max_minutes == null ||
      v.duration_likely_minutes <= v.duration_max_minutes,
    { message: "The usual duration cannot exceed the longest", path: ["duration_max_minutes"] },
  );

export const saveTransportConnection = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: transportSchema,
  handler: async ({ input, supabase }) => {
    const { id, ...fields } = input;

    if (id) {
      const { error } = await supabase
        .from("transport_connections")
        .update(asRow(fields))
        .eq("id", id);
      if (error) throw error;
      revalidatePath("/transport");
      return { id };
    }

    await requireDrafter(supabase, "Adding a new connection");

    const { data, error } = await supabase
      .from("transport_connections")
      .insert(asRow(fields))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/transport");
    return { id: data.id };
  },
});

export const deleteTransportConnection = opsAction({
  roles: ["editor", "admin"],
  input: z.object({ id: uuid }),
  handler: async ({ input, supabase }) => {
    // Through SQL (0042): the hard delete is admin-only in RLS, so an editor's delete used to
    // match nothing and report success. This removes it, its trust records, and audits it.
    const { error } = await supabase.rpc("delete_knowledge_row", {
      p_table: "transport_connections",
      p_id: input.id,
    });
    if (error) throw error;

    revalidatePath("/transport");
    return { id: input.id };
  },
});

// ── Accessibility (O06) ──────────────────────────────────────────────────────

const accessGrade = z.enum(["yes", "no", "partial"]);

const accessibilitySchema = z
  .object({
    place_id: uuid.nullish(),
    route_id: uuid.nullish(),
    step_free: accessGrade.nullish(),
    wheelchair_access: accessGrade.nullish(),
    queue_assistance: z.boolean().nullish(),
    rest_seating: z.boolean().nullish(),
    distance_from_dropoff_m: z.number().int().nonnegative().max(20_000).nullish(),
    notes_i18n: i18nText.default({}),
  })
  .refine((v) => (v.place_id != null) !== (v.route_id != null), {
    message: "Attach this to exactly one place or route",
    path: ["place_id"],
  });

export const saveAccessibility = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: accessibilitySchema,
  handler: async ({ input, supabase }) => {
    // One record per place/route (both columns are unique), so upsert on whichever
    // target is set rather than asking callers to know if one already exists.
    const target = input.place_id ? "place_id" : "route_id";

    const { data: existing, error: existingError } = await supabase
      .from("accessibility_records")
      .select("id")
      .eq(target, (input.place_id ?? input.route_id) as string)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) await requireDrafter(supabase, "Adding an accessibility record");

    const { data, error } = await supabase
      .from("accessibility_records")
      .upsert(asRow(input), { onConflict: target })
      .select("id")
      .single();
    if (error) throw error;

    if (input.place_id) revalidatePath(`/places/${input.place_id}`);
    if (input.route_id) revalidatePath(`/routes/${input.route_id}`);
    return { id: data.id };
  },
});
