/**
 * Translating an entity side by side (O17, PRD F19, OPS-TRANS-02). Pure, so the state a
 * translator sees beside each field is tested.
 *
 * Which fields are translatable is decided in SQL (`translatable_fields()`, 0049) and read from
 * there; this only names them and works out their state.
 */

export type TranslatableTable = "destinations" | "places" | "experiences";

export const TRANSLATABLE_TABLES: readonly TranslatableTable[] = [
  "destinations",
  "places",
  "experiences",
];

export function isTranslatableTable(value: string): value is TranslatableTable {
  return (TRANSLATABLE_TABLES as readonly string[]).includes(value);
}

export type TranslationRecord = {
  field_name: string;
  locale: string;
  status: string;
  source_text: string;
  updated_at: string;
};

export type FieldState =
  "no_english" | "missing" | "unreviewed" | "ai_draft" | "draft" | "confirmed" | "english_changed";

const blank = (value: string | undefined | null) => (value ?? "").trim() === "";

/**
 * A field's state in one language, in the order that matters to a translator: nothing to
 * translate; the English moved since the translation was made; the recorded status; text
 * typed in the editor but never reviewed; nothing yet.
 */
export function fieldState(
  english: string | undefined,
  target: string | undefined,
  record: TranslationRecord | undefined,
): FieldState {
  if (blank(english)) return "no_english";
  if (record && record.source_text !== english) return "english_changed";
  if (
    record &&
    (record.status === "confirmed" || record.status === "draft" || record.status === "ai_draft")
  )
    return record.status;
  if (!blank(target)) return "unreviewed";
  return "missing";
}

const FIELD_LABELS: Record<string, string> = {
  name_i18n: "Name",
  summary_i18n: "Summary",
  overview_i18n: "Overview",
  best_seasons_i18n: "Best seasons",
  seasonal_notes_i18n: "Seasonal notes",
  closure_rules_i18n: "Closures",
  entry_requirements_i18n: "Entry requirements",
  dress_code_i18n: "Dress code",
  hours_note_i18n: "Note on opening hours",
  significance_i18n: "Significance",
  description_i18n: "What happens",
  advance_booking_how_i18n: "How to book",
  eligibility_i18n: "Who can take part",
  cost_note_i18n: "Cost",
  queue_expectation_i18n: "Queue",
  preparation_i18n: "How to prepare",
};

/** Critical fields (TRD §4.4) carry their trust on the field; a translator is told so. */
const CRITICAL = new Set([
  "closure_rules_i18n",
  "entry_requirements_i18n",
  "advance_booking_how_i18n",
]);

export function fieldLabel(field: string): string {
  const known = FIELD_LABELS[field];
  if (known) return known;
  const words = field.replace(/_i18n$/, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isCriticalField(field: string): boolean {
  return CRITICAL.has(field);
}

/** Long values (descriptions) get a larger box than names. */
export function isLongField(field: string): boolean {
  return field !== "name_i18n";
}

export type TranslationOverview = {
  locale: string;
  fields: number;
  confirmed: number;
  drafts: number;
  english_changed: number;
  missing: number;
  next: {
    entity_table: TranslatableTable;
    entity_id: string;
    label: string;
    fields: number;
    confirmed: number;
    english_changed: number;
  }[];
};
