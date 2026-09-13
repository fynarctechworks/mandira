"use server";

import { uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asRow, opsAction } from "@/lib/action";
import { PHRASE_CONTEXT_VALUES } from "@/lib/phrase-draft";
import type { opsSupabase } from "@/lib/supabase";

/**
 * Phrase packs (O18, PRD-OPS-CNT-004, PRD-LANG-004).
 *
 * `status` is absent from these schemas, as on every editor: a phrase reaches travelers only
 * through the publish gate (`publish_entity`, 0029/0032), and the database refuses any other
 * route to `published`. Roles follow the knowledge-table policies in 0008.
 */

const translation = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Add the phrase itself before its transliteration")
    .max(300, "Keep a phrase under 300 characters"),
  transliteration: z
    .string()
    .trim()
    .max(300, "Keep a transliteration under 300 characters")
    .optional(),
});

const phraseFields = z.object({
  destination_id: uuid.nullable(),
  context_tag: z.enum(PHRASE_CONTEXT_VALUES),
  source_locale: z.string().trim().min(2).max(8),
  source_text: z
    .string()
    .trim()
    .min(1, "Write the phrase in its source language")
    .max(300, "Keep a phrase under 300 characters"),
  translations: z.record(z.string().min(2).max(8), translation),
  audio_media_id: uuid.nullable(),
  sort_order: z.number().int().min(0).max(999),
});

const notTheSource = (v: { source_locale: string; translations: Record<string, unknown> }) =>
  !(v.source_locale in v.translations);
const notTheSourceMessage = {
  message: "The source language is the phrase above, not a translation",
  path: ["translations"],
};

type Client = Awaited<ReturnType<typeof opsSupabase>>;

/**
 * Audio a traveler will actually be played: a live audio asset with a licence. The published
 * view refuses anything else (0035), so accepting it here would be a choice that silently
 * does nothing.
 */
async function assertPlayableAudio(supabase: Client, mediaId: string | null): Promise<void> {
  if (!mediaId) return;

  const { data, error } = await supabase
    .from("media_assets")
    .select("media_type, licence, deleted_at")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw error;

  if (!data || data.deleted_at || data.media_type !== "audio" || !data.licence?.trim()) {
    throw Object.assign(new Error("refused"), {
      userMessage:
        "Choose an audio file with a licence recorded. Travelers are only played licensed audio.",
    });
  }
}

export const createPhrase = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: phraseFields.refine(notTheSource, notTheSourceMessage),
  handler: async ({ input, supabase }) => {
    await assertPlayableAudio(supabase, input.audio_media_id);

    const { data, error } = await supabase
      .from("phrases")
      .insert(asRow(input))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/phrases");
    return { id: data.id };
  },
});

export const updatePhrase = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: phraseFields.extend({ id: uuid }).refine(notTheSource, notTheSourceMessage),
  handler: async ({ input, supabase }) => {
    const { id, ...fields } = input;
    await assertPlayableAudio(supabase, fields.audio_media_id);

    const { error } = await supabase.from("phrases").update(asRow(fields)).eq("id", id);
    if (error) throw error;

    revalidatePath("/phrases");
    revalidatePath(`/phrases/${id}`);
    return { id };
  },
});
