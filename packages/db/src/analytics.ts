import { z } from "zod";

/**
 * Privacy-safe product analytics (PRD-ANLY-001, TRD §4.7).
 *
 * PRD §7's metrics, and nothing else. The acceptance criterion is "zero user identifiers",
 * and the way that is kept true is an ALLOWLIST rather than a ban list: an event name not
 * on this list is refused, and a property not named for its event is dropped before the row
 * is built. A ban list only stops what someone thought to forbid, and the thing that leaks
 * is always the field nobody thought about.
 *
 * `analytics_events` has no `user_id` column at all (TRD §4.7), which is the structural half
 * of the same promise. This is the half that stops an identifier arriving inside
 * `properties` as a free-text blob.
 */

/**
 * The events this product measures, and the properties each may carry.
 *
 * Every property here is a CATEGORY or a COUNT — never a value that identifies a person, a
 * device or a specific piece of free text. `destination_id` and `journey_id` are columns on
 * the table rather than properties, and both are the traveler's own scope, not their name.
 */
export const ANALYTICS_EVENTS = {
  // Discovery (PRD F2)
  destination_viewed: ["locale"],
  place_viewed: ["locale"],
  experience_viewed: ["locale"],
  search_performed: ["result_count", "locale"],

  // Planning (PRD F3/F4)
  brief_started: ["entry_point"],
  brief_completed: ["day_count", "traveler_count", "must_do_count"],
  journey_saved: ["day_count", "item_count", "health_state"],
  item_action: ["action", "tier", "is_confirmed"],

  // Health and trust (PRD F5/F9)
  health_viewed: ["health_state", "cause_count"],
  trust_sheet_opened: ["trust_state"],

  // Prepare and share (PRD F7)
  prepare_opened: ["task_count", "done_count"],
  prepare_task_toggled: ["group", "is_done"],
  summary_printed: ["day_count"],
  share_created: [],
  share_revoked: [],

  // Live (PRD F8)
  live_opened: ["card_kind", "health_state"],
  live_action: ["action"],
  navigate_tapped: ["platform"],

  // Offline (PRD F11)
  offline_snapshot_written: ["entity_count"],
  offline_render: ["snapshot_age_minutes"],
  reconcile_card_shown: ["changed_count"],
} as const satisfies Record<string, readonly string[]>;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;

/**
 * Property values are bounded on purpose.
 *
 * A string is capped at 64 characters and must look like a category — lowercase, no spaces.
 * That is what stops "search_term" being smuggled in as a property value, and with it the
 * name of a temple somebody was quietly looking for at 2am.
 */
const propertyValue = z.union([
  z
    .string()
    .max(64)
    .regex(/^[a-z0-9_.:-]*$/, "Categories only, never free text."),
  z.number().finite(),
  z.boolean(),
]);

export const analyticsEventSchema = z.object({
  name: z.string().max(64),
  properties: z.record(z.string().max(40), propertyValue).optional(),
  /** The traveler's own journey, for cohorting. Never a person. */
  journeyId: z.string().uuid().optional(),
  destinationId: z.string().uuid().optional(),
  locale: z.string().max(8).optional(),
  isOffline: z.boolean().optional(),
});

export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

export type AnalyticsRow = {
  event_name: string;
  anon_session_id: string | null;
  journey_id: string | null;
  destination_id: string | null;
  properties: Record<string, string | number | boolean>;
  locale: string | null;
  is_offline: boolean;
};

/**
 * Turn a submitted event into a row, or refuse it.
 *
 * Returns null for an unknown event name. Unknown properties are DROPPED rather than
 * rejecting the whole event: a client shipped last month may send a property this build has
 * since removed, and losing a legitimate measurement over that helps nobody. An unknown
 * NAME is different — that is either a bug or someone probing, and neither should write.
 */
export function toAnalyticsRow(
  input: AnalyticsEventInput,
  anonSessionId: string | null,
): AnalyticsRow | null {
  const allowed = ANALYTICS_EVENTS[input.name as AnalyticsEventName];
  if (!allowed) return null;

  const properties: Record<string, string | number | boolean> = {};
  for (const key of allowed) {
    const value = input.properties?.[key];
    if (value !== undefined) properties[key] = value;
  }

  return {
    event_name: input.name,
    /*
     * The session id is truncated to 16 characters.
     *
     * Enough to group one visit's events together, not enough to be a durable identifier
     * across visits — which is the difference between measuring a funnel and tracking a
     * person (PRD §10, DPDP).
     */
    anon_session_id: anonSessionId ? anonSessionId.slice(0, 16) : null,
    journey_id: input.journeyId ?? null,
    destination_id: input.destinationId ?? null,
    properties,
    locale: input.locale ?? null,
    is_offline: input.isOffline ?? false,
  };
}
