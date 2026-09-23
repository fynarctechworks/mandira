import { humanLabel } from "./labels";
/**
 * The audit trail and version history (O20, PRD-OPS-WF-008). Pure helpers: filter parsing
 * for a URL an operator can share, and the field-by-field comparison both views render.
 */

export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_ACTIONS = ["insert", "update", "delete", "publish"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Every table `audit_ops_change` watches (0029) plus schedules (0032), for the filter. */
export const AUDITED_TABLES = [
  "destinations",
  "circuits",
  "places",
  "routes",
  "route_places",
  "accessibility_records",
  "experiences",
  "availability_rules",
  "transport_connections",
  "travel_estimates",
  "guidance_blocks",
  "phrases",
  "advisories",
  "live_feed_configs",
  "entity_media",
  "media_assets",
  "sources",
  "trust_records",
  "ingestion_jobs",
  "source_captures",
  "change_candidates",
  "conflicts",
  "review_tasks",
  "user_roles",
  "feature_flags",
  "locales",
  "ui_strings",
  "user_reports",
  "publish_schedules",
] as const;

/** Tables `restore_entity_version` accepts (0032) — the ones with a history screen. */
export const VERSIONED_TABLES = [
  "destinations",
  "circuits",
  "places",
  "routes",
  "accessibility_records",
  "experiences",
  "availability_rules",
  "transport_connections",
  "guidance_blocks",
  "phrases",
  "advisories",
  "live_feed_configs",
  "media_assets",
] as const;

export function isVersionedTable(table: string): table is (typeof VERSIONED_TABLES)[number] {
  return (VERSIONED_TABLES as readonly string[]).includes(table);
}

export type AuditFilters = {
  table: string | null;
  action: AuditAction | null;
  actor: string | null;
  from: string | null;
  to: string | null;
  page: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anything unrecognised is dropped rather than passed to the query. */
export function parseAuditFilters(params: Record<string, string | undefined>): AuditFilters {
  const table = params["table"] ?? "";
  const action = params["action"] ?? "";
  const actor = params["actor"] ?? "";
  const page = Number.parseInt(params["page"] ?? "1", 10);

  return {
    table: (AUDITED_TABLES as readonly string[]).includes(table) ? table : null,
    action: (AUDIT_ACTIONS as readonly string[]).includes(action) ? (action as AuditAction) : null,
    actor: UUID.test(actor) ? actor : null,
    from: DATE.test(params["from"] ?? "") ? (params["from"] as string) : null,
    to: DATE.test(params["to"] ?? "") ? (params["to"] as string) : null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Day boundaries in India time, where the team works: `from` inclusive, `to` through its end. */
export function dayRange(filters: Pick<AuditFilters, "from" | "to">): {
  gte: string | null;
  lt: string | null;
} {
  const nextDay = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  };
  return {
    gte: filters.from ? `${filters.from}T00:00:00+05:30` : null,
    lt: filters.to ? `${nextDay(filters.to)}T00:00:00+05:30` : null,
  };
}

/** The query string for another page of the same filtered view. */
export function auditQuery(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.table) params.set("table", filters.table);
  if (filters.action) params.set("action", filters.action);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

const IGNORED = new Set(["updated_at", "created_at"]);

/** Keys whose value differs between two row bodies, housekeeping timestamps aside. */
export function changedKeys(before: unknown, after: unknown): string[] {
  const left = asRecord(before);
  const right = asRecord(after);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys]
    .filter((key) => !IGNORED.has(key))
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

export type FieldChange = { field: string; before: string; after: string };

/**
 * One version compared with the one before it. Uses the fields the trigger recorded as
 * changed when it recorded any, so a version reads the way it was written.
 */
export function versionDiff(
  previous: unknown,
  current: unknown,
  recordedFields: readonly string[] = [],
): FieldChange[] {
  const left = asRecord(previous);
  const right = asRecord(current);
  const fields = recordedFields.length > 0 ? [...recordedFields].sort() : changedKeys(left, right);
  return fields.map((field) => ({
    field,
    before: displayValue(left[field], field),
    after: displayValue(right[field], field),
  }));
}

/**
 * Fields that hold a stored CODE rather than something an operator wrote. Only these are
 * put into words in the history (design review: "draft→in_review"); everything else is
 * shown exactly as stored, because a slug or an excerpt in an audit log must be the
 * literal value — "tirumala" and "Tirumala" are different slugs.
 */
const CODED_FIELDS = new Set([
  "status",
  "place_type",
  "experience_type",
  "facility_subtype",
  "guidance_type",
  "mode",
  "travel_mode",
  "kind",
  "tier",
  "source_type",
  "ingestion_method",
  "verification_status",
  "freshness",
  "confidence",
  "severity",
  "report_type",
]);

export function displayValue(value: unknown, field?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    if (value === "") return "(empty)";
    return field && CODED_FIELDS.has(field) ? humanLabel(value) : value;
  }
  return JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
