import type { ExperienceDraft } from "@/components/experience-form";

/**
 * A blank experience draft.
 *
 * Server components call this, so it must not live in the `"use client"` module that
 * owns the form — Next refuses to invoke a client export from the server (the same trap
 * that broke /places/new during B-009).
 */
export function emptyExperience(destinationId: string): ExperienceDraft {
  return {
    destination_id: destinationId,
    place_id: null,
    route_id: null,
    slug: "",
    name_i18n: {},
    experience_type: "darshan",
    significance_i18n: {},
    description_i18n: {},
    duration_min_minutes: null,
    duration_likely_minutes: null,
    duration_max_minutes: null,
    advance_booking_required: false,
    advance_booking_how_i18n: {},
    advance_booking_opens_days_before: null,
    eligibility_i18n: {},
    cost_note_i18n: {},
    queue_expectation_i18n: {},
    preparation_i18n: {},
    is_outdoor: false,
    editorial_weight: 3,
  };
}
