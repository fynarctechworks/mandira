import type { JourneyImpact } from "@/components/publish-panel";

import { opsSupabase } from "./supabase";

/**
 * How many live journeys contain this entity (PRD-OPS-WF-007).
 *
 * A thin wrapper over `affected_journey_count`, which is where the real constraint lives:
 * Ops has no read on `journeys` or `journey_items` and must not gain one, so a `security
 * definer` function makes the crossing and returns AGGREGATES — no identifier, no title,
 * no item, no traveler.
 *
 * Returns null rather than throwing. An impact number that cannot be read is a missing
 * paragraph on the publish screen; it must never be the reason a correct fact cannot be
 * published.
 */
export async function journeyImpact(
  entityTable: string,
  entityId: string,
): Promise<JourneyImpact | null> {
  const supabase = await opsSupabase();

  const { data, error } = await supabase.rpc("affected_journey_count", {
    p_entity_table: entityTable,
    p_entity_id: entityId,
  });

  if (error || !data) return null;
  return data as unknown as JourneyImpact;
}
