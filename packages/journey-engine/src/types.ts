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
export type KnowledgeBundle = {
  places: Place[];
  experiences: Experience[];
  availability_rules: AvailabilityRule[];
  routes: Route[];
  transport_connections: TransportConnection[];
  travel_estimates?: TravelEstimate[];
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
