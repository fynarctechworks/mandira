"use server";

import { i18nText, uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asRow, opsAction } from "@/lib/action";

/**
 * Media library (O16, OPS-MEDIA-01).
 *
 * A licence is REQUIRED, not optional. PRD F18 blocks publication of any entity whose
 * attached media lacks one, so allowing an unlicensed upload only defers the problem to
 * the approver — and by then nobody remembers where the image came from.
 *
 * Uploads go to the public `media` bucket from the browser (Supabase Storage, gated by the
 * storage policies in 0011); this records the resulting asset. Responsive variants are
 * generated on delivery by Supabase's image transformations (`?width=`, TRD §3) rather
 * than at upload, so there is one original and no derivative files to keep in step.
 */

const mediaFields = {
  storage_path: z.string().min(1),
  media_type: z.enum(["image", "audio", "video"]),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  caption_i18n: i18nText.default({}),
  credit: z.string().max(200).nullish(),
  licence: z
    .string()
    .min(1, "A licence is required — unlicensed media cannot be published")
    .max(200),
};

export const registerMedia = opsAction({
  roles: ["media", "editor", "admin"],
  input: z.object(mediaFields),
  handler: async ({ input, supabase, userId }) => {
    const { data, error } = await supabase
      .from("media_assets")
      .insert(asRow({ ...input, uploaded_by: userId }))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/media");
    return { id: data.id };
  },
});

export const updateMedia = opsAction({
  roles: ["media", "editor", "admin"],
  input: z.object({
    id: uuid,
    caption_i18n: i18nText.default({}),
    credit: z.string().max(200).nullish(),
    licence: z.string().min(1, "A licence is required").max(200),
  }),
  handler: async ({ input, supabase }) => {
    const { id, ...fields } = input;
    const { error } = await supabase.from("media_assets").update(asRow(fields)).eq("id", id);
    if (error) throw error;

    revalidatePath("/media");
    return { id };
  },
});

/**
 * Where the subject of an image is (PRD-OPS-CNT-003, migration 0036).
 *
 * The crop presets (hero 3:2, card 4:3) are ratios over the one original (D-055); this
 * point is what each of them keeps in frame. A separate action from `updateMedia` so that
 * framing an image never re-submits — or needs the form for — its licence and captions.
 * Versioned and audited by the 0029 triggers like every other change to the row.
 */
export const setMediaFocalPoint = opsAction({
  roles: ["media", "editor", "admin"],
  input: z.object({
    id: uuid,
    focal_x: z.number().min(0).max(1),
    focal_y: z.number().min(0).max(1),
  }),
  handler: async ({ input, supabase }) => {
    // The column is numeric(4,3); rounding here means what is saved is what was previewed.
    const focal_x = Math.round(input.focal_x * 1000) / 1000;
    const focal_y = Math.round(input.focal_y * 1000) / 1000;

    const { data, error } = await supabase
      .from("media_assets")
      .update({ focal_x, focal_y })
      .eq("id", input.id)
      .is("deleted_at", null)
      .select("id, focal_x, focal_y")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw Object.assign(new Error("media asset not found"), {
        userMessage: "That image isn't in the library any more. It may have been archived.",
      });
    }

    revalidatePath("/media");
    revalidatePath(`/media/${input.id}`);
    return { id: data.id, focal_x: Number(data.focal_x), focal_y: Number(data.focal_y) };
  },
});

/** Attaches an asset to an entity in a given role (hero, gallery, map, audio). */
export const attachMedia = opsAction({
  roles: ["media", "editor", "admin"],
  input: z.object({
    media_id: uuid,
    entity_table: z.enum(["destinations", "places", "experiences"]),
    entity_id: uuid,
    role: z.enum(["hero", "gallery", "map", "audio"]),
    sort_order: z.number().int().nonnegative().default(0),
  }),
  handler: async ({ input, supabase }) => {
    const { error } = await supabase.from("entity_media").upsert(asRow(input), {
      onConflict: "media_id,entity_table,entity_id",
    });
    if (error) throw error;

    revalidatePath(`/${input.entity_table}/${input.entity_id}`);
    return { attached: true };
  },
});

export const archiveMedia = opsAction({
  roles: ["media", "editor", "admin"],
  input: z.object({ id: uuid }),
  handler: async ({ input, supabase }) => {
    // Soft delete: an asset may already be attached to published content, and removing the
    // row would leave a dangling reference rather than a recoverable mistake.
    const { error } = await supabase
      .from("media_assets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) throw error;

    revalidatePath("/media");
    return { id: input.id };
  },
});
