/**
 * The CRITICAL fields, per TRD §4.4.
 *
 * A published entity is invisible to travelers unless every critical field listed here
 * carries a trust record at `verification_status >= human_reviewed` (D-030). That gate is
 * enforced in SQL by `critical_fields_gated()` inside `0007_published_views.sql`; this
 * list is the UI's view of the same rule, so an operator can see what still stands between
 * a draft and a traveler.
 *
 * KEEP IN SYNC with 0007_published_views.sql. The two are asserted against each other by
 * `critical-fields.test.ts`, which reads the migration — so drift fails the build rather
 * than quietly un-gating a field.
 */

export type CriticalFieldTable =
  "places" | "experiences" | "availability_rules" | "transport_connections";

export type CriticalField = {
  /** Column name, or null for whole-entity trust (availability rules). */
  field: string | null;
  label: string;
  /** Why a traveler depends on it — shown in the trust panel. */
  why: string;
};

export const CRITICAL_FIELDS: Record<CriticalFieldTable, CriticalField[]> = {
  places: [
    {
      field: "opening_schedule",
      label: "Opening hours",
      why: "The engine schedules visits against these. Wrong hours produce a wrong plan.",
    },
    {
      field: "closure_rules_i18n",
      label: "Closure rules",
      why: "Festival and seasonal closures are how a journey ends up at a locked gate.",
    },
    {
      field: "entry_requirements_i18n",
      label: "Entry requirements",
      why: "Dress, ID and eligibility rules decide whether a traveler gets in at all.",
    },
  ],
  experiences: [
    {
      field: "advance_booking_required",
      label: "Advance booking required",
      why: "Drives a Prepare task. Getting this wrong means a traveler arrives unable to take part.",
    },
    {
      field: "advance_booking_how_i18n",
      label: "How to book",
      why: "A booking requirement without instructions is a dead end.",
    },
  ],
  availability_rules: [
    {
      field: null,
      label: "The whole rule",
      why: "Every availability rule is critical — it is what the engine schedules against.",
    },
  ],
  transport_connections: [
    {
      field: "duration_likely_minutes",
      label: "Usual duration",
      why: "Travel legs are built from this. An error shifts every item after it.",
    },
  ],
};

/** Field list for a table, or [] when the table has no critical fields. */
export function criticalFieldsFor(table: string): CriticalField[] {
  return CRITICAL_FIELDS[table as CriticalFieldTable] ?? [];
}
