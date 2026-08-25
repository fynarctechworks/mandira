/**
 * @mandhira/i18n — locale configuration and the `_i18n` fallback helper.
 *
 * Two separate concerns share this package:
 *   1. UI strings, which next-intl resolves from message files (built from `ui_strings`).
 *   2. CONTENT, which lives in `_i18n` jsonb columns and falls back through `getI18n()`.
 *
 * They fall back differently on purpose. A missing UI string is a bug — the build should
 * have produced it. A missing content translation is an ordinary state that a traveler is
 * told about (PRD-KNOW-005), not hidden.
 */

/** Launch locales (D-014). Adding one is a `locales` row plus a message file. */
export const LOCALES = ["en", "te", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  te: "తెలుగు",
  hi: "हिन्दी",
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export type I18nValue = Record<string, string> | null | undefined;

/**
 * Resolves an `_i18n` column for a locale, falling back to English (TRD §1.4).
 *
 * Returns the fallback locale alongside the text so callers can label it — PRD-KNOW-005
 * requires a visible "Not yet available in [language]" rather than silently showing
 * English as though it were a translation. Callers that genuinely do not care can read
 * `.text` alone.
 */
export function getI18n(
  value: I18nValue,
  locale: string,
): { text: string; usedLocale: string | null; isFallback: boolean } {
  const record = value ?? {};

  const exact = record[locale];
  if (typeof exact === "string" && exact.trim() !== "") {
    return { text: exact, usedLocale: locale, isFallback: false };
  }

  const fallback = record[DEFAULT_LOCALE];
  if (typeof fallback === "string" && fallback.trim() !== "") {
    return { text: fallback, usedLocale: DEFAULT_LOCALE, isFallback: true };
  }

  // Any locale is better than an empty page; still marked as a fallback so it can be
  // labelled.
  for (const [key, candidate] of Object.entries(record)) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return { text: candidate, usedLocale: key, isFallback: true };
    }
  }

  return { text: "", usedLocale: null, isFallback: false };
}

/** Convenience for places that only need the string. */
export function t(value: I18nValue, locale: string): string {
  return getI18n(value, locale).text;
}
