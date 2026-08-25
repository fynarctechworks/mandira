import type { PlaceDraft } from "@/components/place-form";

/**
 * A blank place draft.
 *
 * Lives here rather than in `place-form.tsx` because server components call it, and a
 * function exported from a `"use client"` module cannot be invoked on the server — Next
 * rejects it at runtime with "Attempted to call emptyPlace() from the server".
 */
export function emptyPlace(destinationId: string): PlaceDraft {
  return {
    destination_id: destinationId,
    slug: "",
    name_i18n: {},
    place_type: "temple",
    facility_subtype: null,
    address: null,
    summary_i18n: {},
    opening_schedule: {},
    closure_rules_i18n: {},
    entry_requirements_i18n: {},
    dress_code_i18n: {},
    visit_duration_min_minutes: null,
    visit_duration_likely_minutes: null,
    visit_duration_max_minutes: null,
    crowd_pattern: {},
    hours_note_i18n: {},
    editorial_weight: 3,
    latitude: null,
    longitude: null,
  };
}
