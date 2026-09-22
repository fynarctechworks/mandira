import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { LoadProblem } from "@/components/load-problem";
import { LegalNotices, type LegalNoticeRow } from "@/components/legal-notices";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Legal notices · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * O23 — the DPDP text (PRD-PRIV-005). Not a PRD §5 screen; see the note in `lib/nav.ts`.
 *
 * Here rather than in the codebase because a grievance officer changes and waiting for a
 * release to say so is exactly the failure the obligation exists to prevent. Empty until
 * somebody writes it: the app says plainly that nothing is published, and **no account can
 * be created until both the consent notice and the contact are**.
 */
export default async function LegalPage() {
  const supabase = await opsSupabase();
  const [roles, { data, error }, locales] = await Promise.all([
    getOpsRoles(supabase),
    supabase.from("legal_notices").select("key, body_i18n, updated_at").order("key"),
    supabase.from("locales").select("code, name_en").eq("is_active", true).order("sort_order"),
  ]);
  const canEdit = hasAnyRole(roles, ["admin"]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Legal notices</h1>
        <p className="max-w-prose text-body text-text-secondary">
          What travelers agree to when they sign in, and who they contact about it. Required by the
          DPDP Act before the app takes a single account. A traveler sees each of these in their own
          language; where one is missing, the app says so rather than showing English as though it
          were a translation.
        </p>
        {!canEdit ? (
          <p className="text-body-sm text-text-secondary">
            Only admins can change these. They are statements in the company&rsquo;s name.
          </p>
        ) : null}
      </header>

      {error ? (
        <LoadProblem />
      ) : (
        <LegalNotices
          notices={(data ?? []) as LegalNoticeRow[]}
          locales={(locales.data ?? []) as { code: string; name_en: string }[]}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
