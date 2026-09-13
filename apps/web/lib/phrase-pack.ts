import { getI18n } from "@mandhira/i18n";

import { mustList, mustMaybe } from "./data-error";
import type { Text } from "./knowledge";
import { mediaUrl, type PhraseRow } from "./phrases";
import { webSupabase } from "./supabase";

/**
 * Reading a destination's phrase pack (PRD F12, A17) — server only.
 *
 * Through `v_published_phrases` and nothing else, so a draft phrase cannot reach a traveler
 * even by mistake (D-029). A pack is the destination's own phrases plus the universal ones
 * (`destination_id` null), which are useful anywhere.
 *
 * Shared by the A17 page and the offline snapshot, so the phrases a traveler reads online and
 * the ones they carry offline are the same rows in the same shape.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

const COLUMNS =
  "id, destination_id, context_tag, source_locale, source_text, translations, sort_order, audio_path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The raw query. Callers decide whether a failed read is a boundary or a soft miss. */
export function phrasePackQuery(supabase: Client, destinationId: string) {
  // Interpolated into a PostgREST filter, so it must be exactly a uuid and nothing else.
  const id = UUID.test(destinationId) ? destinationId : "00000000-0000-0000-0000-000000000000";

  return supabase
    .from("v_published_phrases")
    .select(COLUMNS)
    .or(`destination_id.eq.${id},destination_id.is.null`)
    .order("sort_order");
}

type ViewRow = {
  id: string | null;
  destination_id: string | null;
  context_tag: string | null;
  source_locale: string | null;
  source_text: string | null;
  translations: unknown;
  sort_order: number | null;
  audio_path: string | null;
};

export function toPhraseRows(rows: ViewRow[]): PhraseRow[] {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];

  return rows.flatMap((row) =>
    row.id && row.context_tag && row.source_locale && row.source_text !== null
      ? [
          {
            id: row.id,
            destination_id: row.destination_id,
            context_tag: row.context_tag,
            source_locale: row.source_locale,
            source_text: row.source_text,
            translations: row.translations ?? {},
            sort_order: row.sort_order ?? 0,
            audio_url: mediaUrl(supabaseUrl, row.audio_path),
          },
        ]
      : [],
  );
}

export type PhrasePage = {
  destination: { id: string; slug: string; name: Text };
  phrases: PhraseRow[];
};

/** A17 for one destination, or null when no such destination is published. */
export async function getPhrasePage(slug: string, locale: string): Promise<PhrasePage | null> {
  const supabase = await webSupabase();

  const destination = mustMaybe(
    await supabase
      .from("v_published_destinations")
      .select("id, slug, name_i18n")
      .eq("slug", slug)
      .maybeSingle(),
    "v_published_destinations",
  );
  if (!destination?.id || !destination.slug) return null;

  const rows = mustList(await phrasePackQuery(supabase, destination.id), "v_published_phrases");
  const name = getI18n(destination.name_i18n as Record<string, string> | null, locale);

  return {
    destination: {
      id: destination.id,
      slug: destination.slug,
      name: { text: name.text, isFallback: name.isFallback },
    },
    phrases: toPhraseRows(rows),
  };
}
