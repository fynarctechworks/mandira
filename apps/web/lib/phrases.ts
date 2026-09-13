/**
 * Phrase assistance (PRD F12, PRD-LANG-004, screen A17) — presentation only.
 *
 * Pure and client-safe: the destination page renders it on the server, and the Live sheet
 * renders it in a browser with no signal from what the snapshot stored. Both must say the
 * same thing, so there is one function that decides what a phrase shows.
 *
 * WHAT A PHRASE SHOWS. A phrase is authored once (`source_text` in `source_locale`) and
 * translated per locale, each with an optional transliteration (TRD §4.4). A traveler sees:
 *   - what it MEANS, in their own language — the translation for their locale, or the source
 *     text, labelled as not yet in their language when that is what they are reading;
 *   - what to SAY — every other language the phrase has been translated into, with its
 *     transliteration, because those are the languages someone nearby may read.
 * The source language is not offered as something to say. It is the language the phrase was
 * written in, not a language of the destination, and the schema records no destination
 * language to choose by.
 */

/** TRD §4.4's `context_tag` values, in the order the tabs appear. */
export const PHRASE_CONTEXTS = [
  "directions",
  "queue",
  "facilities",
  "medical",
  "dietary",
  "greeting",
  "help",
] as const;

export type PhraseContext = (typeof PHRASE_CONTEXTS)[number];

/** The published row as it is read, stored offline, and rendered. */
export type PhraseRow = {
  id: string;
  destination_id: string | null;
  context_tag: string;
  source_locale: string;
  source_text: string;
  translations: unknown;
  sort_order: number;
  /** Resolved on the server from `audio_path`, so no client needs the storage host. */
  audio_url: string | null;
};

export type PhraseLine = { locale: string; text: string; transliteration: string | null };

export type PresentedPhrase = {
  id: string;
  context: PhraseContext;
  meaning: { text: string; locale: string; isFallback: boolean };
  say: PhraseLine[];
  audioUrl: string | null;
};

export type PhraseGroup = { context: PhraseContext; phrases: PresentedPhrase[] };

export function isPhraseContext(value: string): value is PhraseContext {
  return (PHRASE_CONTEXTS as readonly string[]).includes(value);
}

/** `translations` jsonb → locale → line. Anything malformed is skipped, never rendered. */
export function readTranslations(value: unknown): Map<string, Omit<PhraseLine, "locale">> {
  const out = new Map<string, Omit<PhraseLine, "locale">>();
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;

  for (const [locale, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const { text, transliteration } = entry as Record<string, unknown>;
    if (typeof text !== "string" || text.trim() === "") continue;
    out.set(locale, {
      text: text.trim(),
      transliteration:
        typeof transliteration === "string" && transliteration.trim() !== ""
          ? transliteration.trim()
          : null,
    });
  }

  return out;
}

export function presentPhrase(row: PhraseRow, locale: string): PresentedPhrase | null {
  if (!isPhraseContext(row.context_tag)) return null;

  const translations = readTranslations(row.translations);
  const source = row.source_text.trim();

  let meaning: PresentedPhrase["meaning"];
  if (row.source_locale === locale && source) {
    meaning = { text: source, locale, isFallback: false };
  } else if (translations.has(locale)) {
    meaning = { text: translations.get(locale)!.text, locale, isFallback: false };
  } else if (source) {
    meaning = { text: source, locale: row.source_locale, isFallback: true };
  } else {
    return null;
  }

  const say = [...translations.entries()]
    .filter(([code]) => code !== locale && code !== row.source_locale)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, line]) => ({ locale: code, ...line }));

  return { id: row.id, context: row.context_tag, meaning, say, audioUrl: row.audio_url };
}

/** Grouped by situation in the fixed tab order; empty situations are left out. */
export function groupPhrases(rows: PhraseRow[], locale: string): PhraseGroup[] {
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  return PHRASE_CONTEXTS.map((context) => ({
    context,
    phrases: ordered
      .filter((row) => row.context_tag === context)
      .map((row) => presentPhrase(row, locale))
      .filter((phrase): phrase is PresentedPhrase => phrase !== null),
  })).filter((group) => group.phrases.length > 0);
}

/** Public URL of a file in the `media` bucket, or null. Server-side only (reads the env). */
export function mediaUrl(supabaseUrl: string | undefined, path: string | null): string | null {
  if (!supabaseUrl || !path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/media/${encoded}`;
}

/** What "Show to someone" puts on screen: the first thing to say, else the meaning. */
export function showText(phrase: PresentedPhrase): { text: string; locale: string } {
  const first = phrase.say[0];
  return first ? { text: first.text, locale: first.locale } : phrase.meaning;
}
