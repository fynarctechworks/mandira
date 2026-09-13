/**
 * Phrase packs in the Ops editor (O18, PRD-OPS-CNT-004). Pure, so the client form and the
 * server pages can both import it — a function exported from a `"use client"` module cannot
 * be called on the server (see `place-draft.ts`).
 *
 * `phrases.translations` is one jsonb column holding, per locale, the phrase and how to say
 * it: `{ "te": { "text": "...", "transliteration": "..." } }` (TRD §4.4). The form edits the
 * two halves as ordinary `_i18n` tab sets, so an operator uses the same locale tabs as every
 * other editor, and these two functions convert between the shapes.
 */

/** TRD §4.4's `context_tag` check constraint, in the order travelers see the tabs. */
export const PHRASE_CONTEXTS = [
  { value: "directions", label: "Asking directions" },
  { value: "queue", label: "In a queue" },
  { value: "facilities", label: "Facilities" },
  { value: "medical", label: "Medical" },
  { value: "dietary", label: "Food and dietary" },
  { value: "greeting", label: "Greetings" },
  { value: "help", label: "Asking for help" },
] as const;

export type PhraseContext = (typeof PHRASE_CONTEXTS)[number]["value"];

export const PHRASE_CONTEXT_VALUES = PHRASE_CONTEXTS.map((c) => c.value) as [
  PhraseContext,
  ...PhraseContext[],
];

export function contextLabel(value: string): string {
  return PHRASE_CONTEXTS.find((c) => c.value === value)?.label ?? value;
}

export type Translation = { text: string; transliteration?: string };

export type PhraseDraft = {
  id?: string;
  /** null = a universal phrase, offered at every destination. */
  destination_id: string | null;
  context_tag: PhraseContext;
  source_locale: string;
  source_text: string;
  /** The phrase per locale, keyed like any `_i18n` column. */
  text_i18n: Record<string, string>;
  /** How to say it in Latin letters, per locale. */
  transliteration_i18n: Record<string, string>;
  audio_media_id: string | null;
  sort_order: number;
};

export function emptyPhrase(destinationId: string | null): PhraseDraft {
  return {
    destination_id: destinationId,
    context_tag: "directions",
    source_locale: "en",
    source_text: "",
    text_i18n: {},
    transliteration_i18n: {},
    audio_media_id: null,
    sort_order: 0,
  };
}

/**
 * The stored jsonb → the two tab sets. Anything that is not the documented shape is dropped
 * rather than rendered, so a malformed row opens as "not translated" instead of crashing.
 */
export function splitTranslations(value: unknown): {
  text_i18n: Record<string, string>;
  transliteration_i18n: Record<string, string>;
} {
  const text_i18n: Record<string, string> = {};
  const transliteration_i18n: Record<string, string> = {};

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [locale, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const { text, transliteration } = entry as Record<string, unknown>;
      if (typeof text === "string" && text.trim() !== "") text_i18n[locale] = text;
      if (typeof transliteration === "string" && transliteration.trim() !== "") {
        transliteration_i18n[locale] = transliteration;
      }
    }
  }

  return { text_i18n, transliteration_i18n };
}

/**
 * The two tab sets → the stored jsonb.
 *
 * The source locale is left out: the phrase in its own language is `source_text`, and a
 * second copy under `translations` is a second place for it to disagree with itself.
 *
 * A transliteration with no phrase beside it is kept, with an empty `text`, so validation
 * can say what is missing instead of the transliteration silently vanishing.
 */
export function joinTranslations(
  text_i18n: Record<string, string>,
  transliteration_i18n: Record<string, string>,
  sourceLocale: string,
): Record<string, Translation> {
  const locales = new Set([...Object.keys(text_i18n), ...Object.keys(transliteration_i18n)]);
  const out: Record<string, Translation> = {};

  for (const locale of [...locales].sort()) {
    if (locale === sourceLocale) continue;
    const text = (text_i18n[locale] ?? "").trim();
    const transliteration = (transliteration_i18n[locale] ?? "").trim();
    if (!text && !transliteration) continue;
    out[locale] = transliteration ? { text, transliteration } : { text };
  }

  return out;
}
