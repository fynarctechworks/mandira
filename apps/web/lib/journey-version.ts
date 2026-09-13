import { mustMaybe } from "./data-error";
import type { webSupabase } from "./supabase";

type Client = Awaited<ReturnType<typeof webSupabase>>;

/**
 * The journey columns a traveler edits, and the only ones its version answers for.
 *
 * NOT `journeys.updated_at`. That moves on every write to the row, including bookkeeping no
 * traveler made — `knowledge_checked_at`, stamped a few seconds after a journey is opened —
 * so every open view took it for an edit on another device and refreshed itself.
 */
const CONTENT_COLUMNS =
  "title, start_date, end_date, timezone, day_start_time, day_end_time, pace, status";

/**
 * A journey's version: what it says, plus the latest change to any of its items
 * (PRD-ACCT-005).
 *
 * A second device compares this against the version it rendered and refreshes when they
 * differ, which is how an edit made on one phone shows on the other within seconds. Removed
 * items still count — removal is a soft delete that moves `updated_at` — so taking something
 * out is noticed as surely as adding it. Read under RLS: another traveler's journey has no
 * version at all.
 *
 * Opaque to the client, which only ever compares it for equality.
 */
export async function journeyVersion(supabase: Client, journeyId: string): Promise<string | null> {
  const journey = mustMaybe(
    await supabase
      .from("journeys")
      .select(CONTENT_COLUMNS)
      .eq("id", journeyId)
      .is("deleted_at", null)
      .maybeSingle(),
    "journeys",
  );
  if (!journey) return null;

  const item = mustMaybe(
    await supabase
      .from("journey_items")
      .select("updated_at")
      .eq("journey_id", journeyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "journey_items",
  );

  return versionOf(journey as Record<string, unknown>, item?.updated_at ?? null);
}

/** The items' latest change and a digest of the journey's own content, as one string. */
export function versionOf(
  journey: Record<string, unknown>,
  latestItemChange: string | null,
): string {
  const content = CONTENT_COLUMNS.split(", ").map((column) => journey[column] ?? null);
  return `${latestItemChange ?? "-"}.${digest(JSON.stringify(content))}`;
}

/**
 * FNV-1a, 32-bit. A change detector, not a security boundary: the version is read by the
 * journey's own traveler, who can already read everything it summarises.
 */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
