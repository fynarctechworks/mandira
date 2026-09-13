/**
 * Naming and addressing Ops entities. Pure, so client components can import it without
 * pulling the server Supabase client into the browser bundle.
 */

/** English-first label with a visible fallback — PRD-KNOW-005 forbids a silent blank. */
export function labelOf(nameI18n: unknown, fallback: string): string {
  if (nameI18n && typeof nameI18n === "object") {
    const record = nameI18n as Record<string, unknown>;
    for (const key of ["en", ...Object.keys(record)]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
  }
  return fallback;
}

const NOUN: Record<string, string> = {
  destinations: "Destination",
  circuits: "Circuit",
  places: "Place",
  routes: "Route",
  route_places: "Route stop",
  accessibility_records: "Accessibility",
  experiences: "Experience",
  availability_rules: "Availability rule",
  transport_connections: "Transport",
  guidance_blocks: "Guidance",
  phrases: "Phrase",
  advisories: "Advisory",
  live_feed_configs: "Live feed",
  media_assets: "Media",
  entity_media: "Media link",
  sources: "Source",
  trust_records: "Trust record",
  ingestion_jobs: "Ingestion run",
  source_captures: "Capture",
  change_candidates: "Change candidate",
  conflicts: "Conflict",
  review_tasks: "Task",
  user_roles: "Role",
  feature_flags: "Feature flag",
  locales: "Locale",
  ui_strings: "UI string",
  user_reports: "Report",
  publish_schedules: "Scheduled publish",
};

/** "Place", "Transport" — for a table name an operator should never have to read raw. */
export function entityNoun(table: string): string {
  return NOUN[table] ?? table.replace(/_/g, " ");
}

/** Where an operator edits this entity, or null when it has no screen of its own. */
export function editorPath(table: string, id: string | null): string | null {
  switch (table) {
    case "destinations":
    case "places":
    case "experiences":
    case "routes":
    case "advisories":
    case "phrases":
    case "sources":
      return id ? `/${table}/${id}` : `/${table}`;
    case "transport_connections":
      return "/transport";
    case "guidance_blocks":
      return "/guidance";
    case "media_assets":
      return "/media";
    default:
      return null;
  }
}

/** Every table `publish_entity` accepts (0032), in the order the approve queue lists them. */
export const PUBLISHABLE_TABLES = [
  "destinations",
  "places",
  "experiences",
  "routes",
  "transport_connections",
  "guidance_blocks",
  "phrases",
  "advisories",
] as const;

export type PublishableTable = (typeof PUBLISHABLE_TABLES)[number];

/** Short relative age, for queue heads: "3 days", "5 hours", "just now". */
export function ageOf(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes < 2 ? "just now" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/** "12 Mar 2026, 14:05" in the operator's own timezone. */
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
