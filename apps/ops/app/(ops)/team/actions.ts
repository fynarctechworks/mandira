"use server";

import { uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";
import { OPS_ROLES, revokeRefusal } from "@/lib/team";

/**
 * The Ops team, its roles and the feature flags (O21, PRD F20). Admin only — in RLS
 * (`user_roles_admin_write`, `feature_flags_admin_write`), in the SQL functions, and here.
 * Every change is written to `audit_log` by trigger (0029).
 */

const refuse = (userMessage: string) => Object.assign(new Error("refused"), { userMessage });

export const grantRole = opsAction({
  roles: ["admin"],
  input: z.object({
    email: z.string().trim().email("Enter the email they sign in with"),
    role: z.enum(OPS_ROLES),
  }),
  handler: async ({ input, supabase, userId }) => {
    const { data: found, error } = await supabase.rpc("ops_find_account", { p_email: input.email });
    if (error) throw error;

    const account = found?.[0];
    if (!account) {
      throw refuse("No account uses that email. They need to sign in to Mandhira once first.");
    }

    const { error: insertError } = await supabase
      .from("user_roles")
      .insert({ user_id: account.user_id, role: input.role, granted_by: userId });
    if (insertError?.code === "23505")
      throw refuse(`${account.email} already holds ${input.role}.`);
    if (insertError) throw insertError;

    revalidatePath("/team");
    return { email: account.email, role: input.role };
  },
});

export const revokeRole = opsAction({
  roles: ["admin"],
  input: z.object({ user_id: uuid, role: z.enum(OPS_ROLES) }),
  handler: async ({ input, supabase, userId }) => {
    const { data: team, error } = await supabase.rpc("ops_team");
    if (error) throw error;

    const refusal = revokeRefusal(team, userId, input.user_id, input.role);
    if (refusal) throw refuse(refusal);

    const { error: deleteError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", input.user_id)
      .eq("role", input.role);
    if (deleteError) throw deleteError;

    revalidatePath("/team");
    return { revoked: true };
  },
});

const flagKey = z.string().min(1).max(100);

export const setFeatureFlag = opsAction({
  roles: ["admin"],
  input: z.object({ key: flagKey, is_enabled: z.boolean() }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("feature_flags")
      .update({ is_enabled: input.is_enabled })
      .eq("key", input.key)
      .select("key");
    if (error) throw error;
    if (data.length === 0) throw refuse("That flag no longer exists.");

    revalidatePath("/team");
    return { key: input.key, is_enabled: input.is_enabled };
  },
});

export const describeFeatureFlag = opsAction({
  roles: ["admin"],
  input: z.object({ key: flagKey, description: z.string().trim().max(500) }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("feature_flags")
      .update({ description: input.description || null })
      .eq("key", input.key)
      .select("key");
    if (error) throw error;
    if (data.length === 0) throw refuse("That flag no longer exists.");

    revalidatePath("/team");
    return { key: input.key };
  },
});
