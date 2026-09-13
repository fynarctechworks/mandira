import { extractClaims } from "./grounding";

/**
 * Translation suggestions for the Ops translation workspace (TRD §7.1 `suggestTranslation`).
 *
 * A suggestion, never a translation: a translator confirms it before it is used (`ui_strings`
 * status `ai_draft` → `confirmed`). What this file enforces is that a suggestion cannot
 * carry a time, date, amount or quantity the source text did not contain.
 */

export type SuggestTranslationInput = {
  text: string;
  from: string;
  to: string;
  /** Where the string appears, so the model can pick the right register. */
  context?: string;
};

export type SuggestedTranslation =
  { text: string; offending: [] } | { text: null; offending: string[] };

export const MAX_TRANSLATION_CHARS = 4000;

export function groundTranslation(output: string, source: string): SuggestedTranslation {
  const allowed = new Set(extractClaims(source));
  const offending = extractClaims(output).filter((claim) => !allowed.has(claim));

  return offending.length === 0
    ? { text: output.trim(), offending: [] }
    : { text: null, offending };
}
