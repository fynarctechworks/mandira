import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { LoadProblem } from "@/components/load-problem";
import { PublishQueue } from "@/components/publish-queue";
import { loadPublishQueue } from "@/lib/publish-queue";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Approve & publish · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * Approve & publish queue (O13, PRD-OPS-WF-004).
 *
 * Everything submitted for review, of all eight publishable kinds, with what is still
 * blocking it — from the same SQL function that enforces the gate — and everything
 * scheduled to go out.
 */
export default async function PublishQueuePage() {
  const supabase = await opsSupabase();
  const [roles, loaded] = await Promise.all([
    getOpsRoles(supabase),
    loadPublishQueue().then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    ),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">Approve &amp; publish</h1>
        <p className="mt-1 text-body text-text-secondary">
          Everything waiting for a second pair of eyes. Publishing needs the approver role, and
          cannot be done by whoever made the last change.
        </p>
      </header>

      {!loaded.ok ? (
        <LoadProblem />
      ) : loaded.value.candidates.length === 0 && loaded.value.schedules.length === 0 ? (
        <p className="text-body text-text-secondary">
          Nothing is waiting for review. Submit a draft from its editor when it&apos;s ready.
        </p>
      ) : (
        <PublishQueue
          candidates={loaded.value.candidates}
          schedules={loaded.value.schedules}
          canPublish={hasAnyRole(roles, ["approver", "admin"])}
        />
      )}
    </div>
  );
}
