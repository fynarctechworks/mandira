import { mustMaybe } from "./data-error";
import type { webSupabase } from "./supabase";

type Client = Awaited<ReturnType<typeof webSupabase>>;

/**
 * A journey's version: the moment of the latest change to it or to any of its items
 * (PRD-ACCT-005).
 *
 * A second device compares this against the version it rendered and refreshes when they
 * differ, which is how an edit made on one phone shows on the other within seconds. Removed
 * items still count — removal is a soft delete that moves `updated_at` — so taking something
 * out is noticed as surely as adding it. Read under RLS: another traveler's journey has no
 * version at all.
 */
export async function journeyVersion(supabase: Client, journeyId: string): Promise<string | null> {
  const journey = mustMaybe(
    await supabase
      .from("journeys")
      .select("updated_at")
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

  return latestOf(journey.updated_at, item?.updated_at ?? null);
}

export function latestOf(first: string, second: string | null): string {
  return second && Date.parse(second) > Date.parse(first) ? second : first;
}
