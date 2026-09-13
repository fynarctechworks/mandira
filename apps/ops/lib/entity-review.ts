import { opsSupabase } from "./supabase";

/**
 * Read-only loaders for an entity's review state, used by server-rendered pages.
 *
 * Deliberately NOT in a `"use server"` module: every export of such a file becomes an
 * addressable POST endpoint, and these two were reachable by any signed-in account without
 * `opsAction`'s role gate (audit S-8). As plain server functions they can only run inside a
 * page render, which the Ops layout has already role-gated — and the database refuses
 * non-Ops callers underneath (0008 trust_records RLS, 0029 validate_for_publish).
 */

/** What is still blocking publication, from the same function the gate uses. */
export async function validationProblems(
  entityTable: string,
  entityId: string,
): Promise<{ field: string; message: string }[]> {
  const supabase = await opsSupabase();
  const { data, error } = await supabase.rpc("validate_for_publish", {
    p_entity_table: entityTable,
    p_entity_id: entityId,
  });

  if (error) throw error;
  return Array.isArray(data) ? (data as { field: string; message: string }[]) : [];
}

/** Trust records already attached to one entity, keyed by field name (or "entity"). */
export async function trustForEntity(entityTable: string, entityId: string) {
  const supabase = await opsSupabase();
  const { data, error } = await supabase
    .from("trust_records")
    .select(
      "id, field_name, source_id, verification_status, verified_at, valid_until, evidence_url, evidence_excerpt, conflict_flag, freshness, confidence",
    )
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId);

  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.field_name ?? "entity", row]));
}
