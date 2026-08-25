import { opsSupabase } from "./supabase";

/**
 * Sources available to verify against.
 *
 * Retired sources are excluded: a fact should not be newly verified against something the
 * team has stopped trusting, even though existing trust records keep pointing at it.
 */
export async function activeSources(): Promise<{ id: string; label: string; tier: string }[]> {
  const supabase = await opsSupabase();
  const { data } = await supabase
    .from("sources")
    .select("id, name, tier")
    .in("status", ["active", "paused"])
    .order("tier")
    .order("name");

  return (data ?? []).map((s) => ({ id: s.id, label: s.name, tier: s.tier }));
}
