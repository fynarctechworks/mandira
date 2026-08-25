import { isOpsUser } from "@mandhira/db/client/roles";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { opsSupabase } from "@/lib/supabase";

/**
 * The Ops role gate (TRD §11.2 Day 4, AUTHORIZATION_MODEL layer 2).
 *
 * Every route in this group is behind it: a signed-in traveler with no Ops role gets
 * bounced, not a partially-rendered Ops shell. Note this is a redirect, not a hidden nav
 * — UI hiding is never a control (CLAUDE.md §4). RLS independently denies every query
 * such a user could make, so a bug here degrades to "empty screens", not a data leak.
 */
export default async function OpsLayout({ children }: { children: ReactNode }) {
  const supabase = await opsSupabase();

  if (!(await isOpsUser(supabase))) {
    redirect("/no-access");
  }

  return <>{children}</>;
}
