import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { FeatureFlags, type FlagRow } from "@/components/feature-flags";
import { LoadProblem, RoleNotice } from "@/components/load-problem";
import { TeamRoles, type TeamRow } from "@/components/team-roles";
import { opsSupabase } from "@/lib/supabase";
import { ToggleLeft } from "lucide-react";
import { QueueEmpty } from "@/components/queue-empty";

export const metadata = { title: "Users, roles & flags · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * O21 — Users, roles and feature flags (PRD F20, PRD-OPS-MON-003).
 *
 * Only people who already hold an Ops role are listed: travelers are not Ops's to browse,
 * so a new person is found by their exact email, one at a time (`ops_find_account`).
 */
export default async function TeamPage() {
  const supabase = await opsSupabase();
  const roles = await getOpsRoles(supabase);

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-h1">Users, roles &amp; flags</h1>
      <p className="text-body text-text-secondary">
        Who can do what in Ops, and which features are switched on. Every change here is recorded in
        the audit log.
      </p>
    </header>
  );

  if (!hasAnyRole(roles, ["admin"])) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <RoleNotice>The team and feature flags are managed by admins.</RoleNotice>
      </div>
    );
  }

  const [
    {
      data: { user },
    },
    team,
    flags,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("ops_team"),
    supabase
      .from("feature_flags")
      .select("key, is_enabled, destination_ids, description")
      .order("key"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {header}

      <section aria-labelledby="team-heading" className="flex flex-col gap-3">
        <h2 id="team-heading" className="text-h3">
          Team
        </h2>
        {team.error ? (
          <LoadProblem />
        ) : (
          <TeamRoles team={(team.data ?? []) as TeamRow[]} userId={user?.id ?? ""} />
        )}
      </section>

      <section aria-labelledby="flags-heading" className="flex flex-col gap-3">
        <h2 id="flags-heading" className="text-h3">
          Feature flags
        </h2>
        {flags.error ? (
          <LoadProblem />
        ) : (flags.data ?? []).length === 0 ? (
          <QueueEmpty
            icon={ToggleLeft}
            title="No feature flags are defined"
            description="A flag is added with its migration, alongside the code it switches."
          />
        ) : (
          <FeatureFlags flags={flags.data as FlagRow[]} />
        )}
      </section>
    </div>
  );
}
