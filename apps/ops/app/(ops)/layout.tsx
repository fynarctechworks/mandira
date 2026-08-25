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
/*
 * Never serve an Ops screen from cache.
 *
 * Operators act on what they just did — register a source, then verify a field against it
 * on the next screen. A cached read makes the source they created a moment ago simply
 * absent, with no error to explain it (observed in B-011). Ops is a low-traffic
 * authenticated tool; correctness is worth far more here than a cache hit.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
