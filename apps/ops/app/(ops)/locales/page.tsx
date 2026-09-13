import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { LoadProblem } from "@/components/load-problem";
import { LocalesAdmin, type LocaleRow } from "@/components/locales-admin";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Locales · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * O18 — Locales (PRD F19, PRD-LANG-002). A language becomes available across the app and
 * Ops by being a row here (D-028). Every Ops role can see the list; admins change it.
 */
export default async function LocalesPage() {
  const supabase = await opsSupabase();
  const [roles, { data, error }] = await Promise.all([
    getOpsRoles(supabase),
    supabase
      .from("locales")
      .select("code, name_native, name_en, script, transliteration_scheme, is_active, sort_order")
      .order("sort_order")
      .order("code"),
  ]);
  const canEdit = hasAnyRole(roles, ["admin"]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Locales</h1>
        <p className="text-body text-text-secondary">
          The languages Mandhira offers. Switching one on makes it available to travelers and adds a
          tab for it in every Ops editor.
        </p>
        {!canEdit ? (
          <p className="text-body-sm text-text-secondary">Only admins can change locales.</p>
        ) : null}
      </header>

      {error ? <LoadProblem /> : <LocalesAdmin locales={data as LocaleRow[]} canEdit={canEdit} />}
    </div>
  );
}
