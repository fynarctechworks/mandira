/**
 * The engine's input contract.
 *
 * `KnowledgeBundle` is deliberately ONE type (D-005): it is simultaneously the engine's
 * input, the Dexie snapshot stored for offline use, and the shape the snapshot API
 * returns. That identity is what makes the engine behave identically online and offline —
 * there is no second code path to keep in step.
 *
 * Types are declared here rather than imported from `@mandhira/db` because the engine has
 * zero dependencies on the database, providers or apps (ARCHITECTURE §3). They are
 * structurally compatible with the generated row types, and `contract.test.ts` asserts
 * that rather than leaving it to hope.
 */

export type PriorityTier = "fixed" | "protected" | "important" | "optional";

export type JourneyItemType =
  "experience" | "travel_leg" | "rest" | "meal" | "fixed_commitment" | "free_time";

export type TravelMode = "walk" | "vehicle" | "public_transport" | "hired" | "other";

export type AvailabilityKind =
  | "always_during_opening"
  | "daily_fixed_times"
  | "weekly_pattern"
  | "date_range"
  | "calendar_dates"
  | "on_request";

export type StepFree = "yes" | "no" | "partial";

export type Mobility = "full" | "limited_walking" | "wheelchair" | "needs_rest_frequently";
export type AgeBand = "child" | "adult" | "senior";

/** "HH:MM", 24-hour. */
export type TimeOfDay = string;
/** "YYYY-MM-DD". */
export type IsoDate = string;

export type TimeWindow = { start: TimeOfDay; end: TimeOfDay };

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type AvailabilityRule = {
  id: string;
  experience_id: string;
  kind: AvailabilityKind;
  daily_times?: TimeWindow[] | null;
  weekly_pattern?: Partial<Record<Weekday, TimeWindow[]>> | null;
  date_start?: IsoDate | null;
  date_end?: IsoDate | null;
  calendar_dates?: IsoDate[] | null;
  /** Higher wins where windows overlap. */
  priority: number;
  valid_from?: IsoDate | null;
  valid_to?: IsoDate | null;
};

export type OpeningSchedule = {
  weekly?: Partial<Record<Weekday, [TimeOfDay, TimeOfDay][]>>;
  exceptions?: {
    date: IsoDate;
    hours?: [TimeOfDay, TimeOfDay][];
    closed?: boolean;
  }[];
};

export type Place = {
  id: string;
  opening_schedule?: OpeningSchedule | null;
  /** Locale-resolved by the caller, for the same reason as above. */
  dress_code?: string | null;
  entry_requirements?: string | null;
  /**
   * From `v_published_places.accessibility ->> 'step_free'` (0015), with its vocabulary
   * intact.
   *
   * "partial" and "not recorded" are distinct answers to a wheelchair user, and neither
   * rounds safely to yes or no — flattening them to a boolean would either alarm someone
   * needlessly or send them somewhere they cannot get into (PRD-HLTH-005).
   */
  step_free?: StepFree | null;
  visit_duration_min_minutes?: number | null;
  visit_duration_likely_minutes?: number | null;
  visit_duration_max_minutes?: number | null;
};

export type Experience = {
  id: string;
  place_id?: string | null;
  route_id?: string | null;
  duration_min_minutes?: number | null;
  duration_likely_minutes?: number | null;
  duration_max_minutes?: number | null;
  is_outdoor?: boolean;
  /** CRITICAL field — drives a Prepare task (PRD F7). */
  advance_booking_required?: boolean;
  /** Already resolved to the traveler's locale by the caller; the engine renders nothing. */
  advance_booking_how?: string | null;
  advance_booking_opens_days_before?: number | null;
};

export type TransportConnection = {
  id: string;
  from_place_id?: string | null;
  to_place_id?: string | null;
  mode: TravelMode;
  duration_likely_minutes?: number | null;
  duration_max_minutes?: number | null;
};

export type Route = {
  id: string;
  distance_m?: number | null;
  duration_likely_minutes?: number | null;
  duration_max_minutes?: number | null;
};

/** Cached travel leg between two places (TRD §4.4 `travel_estimates`). */
export type TravelEstimate = {
  from_place_id: string;
  to_place_id: string;
  mode: TravelMode;
  distance_m?: number | null;
  duration_seconds?: number | null;
};

export type TravelerProfile = {
  id: string;
  mobility: Mobility;
  age_band: AgeBand;
};

export type JourneyItem = {
  id: string;
  day_index: number;
  sort_order: number;
  item_type: JourneyItemType;
  tier: PriorityTier;
  experience_id?: string | null;
  place_id?: string | null;
  route_id?: string | null;
  transport_connection_id?: string | null;
  /** Required when tier is `fixed` — the anchor everything else is placed around. */
  fixed_start_at?: string | null;
  fixed_end_at?: string | null;
  preferred_window_start?: TimeOfDay | null;
  preferred_window_end?: TimeOfDay | null;
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  duration_likely_minutes?: number | null;
  duration_max_minutes?: number | null;
  travel_mode?: TravelMode | null;
  buffer_minutes?: number | null;
  /**
   * What actually happened, recorded by Live's actions (PRD-LIVE-002). Optional: a plan
   * still being made has none, and every reader behaves as before without them.
   */
  status?: "planned" | "in_progress" | "done" | "skipped" | "moved";
  actual_start_at?: string | null;
  actual_end_at?: string | null;
};

export type JourneyItemDependency = { item_id: string; after_item_id: string };

export type Journey = {
  id: string;
  start_date: IsoDate;
  end_date?: IsoDate | null;
  timezone: string;
  day_start_time: TimeOfDay;
  day_end_time: TimeOfDay;
};

/**
 * Everything the engine may read. Nothing outside this is available to it — no network, no
 * database, no clock beyond what the caller passes in.
 */
/** Trust for one entity, keyed by field name (or "entity"), as the published views emit. */
export type TrustEntry = {
  confidence: "high" | "medium" | "low";
  freshness: "fresh" | "aging" | "stale";
  conflict_flag: boolean;
  /** The value changed after it was verified, so nobody has checked the words shown. */
  needs_reverification?: boolean;
  verified_at?: string | null;
  valid_until?: string | null;
};

export type KnowledgeBundle = {
  places: Place[];
  experiences: Experience[];
  availability_rules: AvailabilityRule[];
  routes: Route[];
  transport_connections: TransportConnection[];
  travel_estimates?: TravelEstimate[];
  /**
   * Trust records by entity id. Health reports trust exposure from these (PRD F5 check 5),
   * and the traveler UI renders badges from the same data — one source, so a badge and a
   * health cause can never disagree.
   */
  trust?: Record<string, Record<string, TrustEntry>>;
};

/** Why the engine could not do what was asked, in terms a person can act on. */
export type Warning = {
  code:
    | "outside_availability"
    | "outside_day_window"
    | "no_duration"
    | "dependency_cycle"
    | "fixed_overlap"
    | "unreachable_fixed";
  itemId: string;
  message: string;
  /** Minutes by which it misses, where that is meaningful. */
  byMinutes?: number;
};

export type Pace = "relaxed" | "balanced" | "full";

/** One experience the traveler named, at the tier their words placed it in (PRD F3). */
export type BriefExperience = {
  experience_id: string;
  /** Set only when the traveler themselves pinned it to a day. */
  day_index?: number | null;
  preferred_window_start?: TimeOfDay | null;
  preferred_window_end?: TimeOfDay | null;
};

/** A commitment with a real clock time the journey has to work around (PRD F4 FIXED). */
export type BriefFixedCommitment = {
  id?: string;
  at: string;
  end_at?: string | null;
  place_id?: string | null;
  item_type?: JourneyItemType;
};

/**
 * The confirmed Journey Brief (PRD F3), as the traveler approved it.
 *
 * Every experience here was named by the traveler or explicitly confirmed by them. The
 * engine treats it as a closed list and adds nothing to it — PRD F4 is explicit that there
 * is no "auto-fill my day with top places".
 */
export type JourneyBrief = {
  destination_id?: string | null;
  start_date: IsoDate;
  end_date?: IsoDate | null;
  day_count?: number | null;
  timezone?: string;
  day_start_time?: TimeOfDay;
  day_end_time?: TimeOfDay;
  pace?: Pace;
  /** → PROTECTED. */
  must_do?: BriefExperience[];
  /** → IMPORTANT. */
  would_like?: BriefExperience[];
  /** → OPTIONAL. */
  might_do?: BriefExperience[];
  /** → FIXED. */
  fixed_commitments?: BriefFixedCommitment[];
};
