import { getOpsRoles } from "@mandhira/db/client/roles";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { OpsShell } from "@/components/ops-shell";
import { opsSupabase } from "@/lib/supabase";

/**
 * The Ops role gate (TRD §11.2 Day 4, AUTHORIZATION_MODEL layer 2), wrapping the shell.
 *
 * Every route in this group is behind it: a signed-in traveler with no Ops role is
 * redirected, not shown a partially-rendered Ops app. This is a redirect rather than a
 * hidden nav — UI hiding is never a control (CLAUDE.md §4). RLS independently denies every
 * query such a user could make, so a bug here degrades to empty screens, not a data leak.
 */
export default async function OpsLayout({ children }: { children: ReactNode }) {
  const supabase = await opsSupabase();

  const roles = await getOpsRoles(supabase);
  if (roles.length === 0) {
    redirect("/no-access");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <OpsShell operatorEmail={user?.email ?? "Signed in"} roles={roles}>
      {children}
    </OpsShell>
  );
}
