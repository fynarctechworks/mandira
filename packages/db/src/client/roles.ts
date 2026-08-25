import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import type { Enums } from "../types-helpers";

export type OpsRole = Enums<"ops_role_enum">;

/**
 * Reads the current user's Ops roles.
 *
 * This is the SERVER-SIDE half of the authorization story, not the whole of it. RLS is
 * the primary control (0008) and re-checks every query regardless of what this returns;
 * this exists so route guards and layouts can decide what to render and where to
 * redirect. UI hiding is never a control on its own (CLAUDE.md §4).
 */
export async function getOpsRoles(supabase: SupabaseClient<Database>): Promise<OpsRole[]> {
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) return [];

  // RLS lets a user read their own roles, so no service-role escalation is needed here.
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userResult.user.id);

  if (error) return [];
  return data.map((r) => r.role);
}

/** True when the user holds any Ops role — the gate for entering the Ops app at all. */
export async function isOpsUser(supabase: SupabaseClient<Database>): Promise<boolean> {
  return (await getOpsRoles(supabase)).length > 0;
}

/** True when the user holds at least one of the required roles. */
export function hasAnyRole(held: OpsRole[], required: readonly OpsRole[]): boolean {
  return held.some((role) => required.includes(role));
}
