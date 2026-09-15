import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { buttonVariants } from "@mandhira/ui/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityTranslation, type TranslationRow } from "@/components/entity-translation";
import { LoadProblem } from "@/components/load-problem";
import {
  fieldLabel,
  fieldState,
  isCriticalField,
  isLongField,
  isTranslatableTable,
  type TranslationOverview,
  type TranslationRecord,
} from "@/lib/content-translations";
import { editorPath, labelOf } from "@/lib/entities";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Translate · Mandhira Ops" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O17 — one entity, side by side (PRD F19, PRD-OPS-CNT-004, OPS-TRANS-02).
 *
 * Every translatable field with its English beside the chosen language, its state, and the
 * way to suggest, save or confirm it. Which fields appear is `translatable_fields()` (0049),
 * the same list the write path enforces.
 */
export default async function EntityTranslationPage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string; id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { table, id } = await params;
  if (!isTranslatableTable(table) || !UUID.test(id)) notFound();

  const query = await searchParams;
  const supabase = await opsSupabase();
  const [roles, locales, fieldsResult] = await Promise.all([
    getOpsRoles(supabase),
    activeLocales(),
    supabase.rpc("translatable_fields", { p_entity_table: table }),
  ]);

  const targets = locales.filter((locale) => locale.code !== "en");
  const target = targets.find((locale) => locale.code === query.locale) ?? targets[0];

  if (!target) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1">Translate</h1>
        <p className="text-body text-text-secondary">
          Add a language other than English to start translating content.
        </p>
      </div>
    );
  }

  /*
   * The table name is one of three, checked above. The generated client types each table
   * separately, so the row is read as one of them and handled as a plain record.
   */
  const [entityResult, recordsResult, overviewResult] = await Promise.all([
    supabase
      .from(table as "places")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("content_translations")
      .select("field_name, locale, status, source_text, updated_at")
      .eq("entity_table", table)
      .eq("entity_id", id)
      .eq("locale", target.code),
    supabase.rpc("content_translation_overview", {
      p_locale: target.code,
      p_limit: 1,
      p_entity_id: id,
    }),
  ]);

  if (entityResult.error || fieldsResult.error || recordsResult.error) {
    return <LoadProblem />;
  }
  if (!entityResult.data) notFound();

  const row = entityResult.data as unknown as Record<string, unknown>;
  const records = new Map(
    ((recordsResult.data ?? []) as TranslationRecord[]).map((record) => [
      record.field_name,
      record,
    ]),
  );
  const rows: TranslationRow[] = ((fieldsResult.data ?? []) as string[]).map((field) => {
    const value = (row[field] ?? {}) as Record<string, string>;
    return {
      field,
      label: fieldLabel(field),
      critical: isCriticalField(field),
      long: isLongField(field),
      english: value["en"] ?? "",
      target: value[target.code] ?? "",
      state: fieldState(value["en"], value[target.code], records.get(field)),
    };
  });

  const name = labelOf(row["name_i18n"], String(row["slug"] ?? id));
  const overview = overviewResult.data as unknown as TranslationOverview | null;
  const canEdit = hasAnyRole(roles, ["translator", "editor", "admin"]);
  const editor = editorPath(table, id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-3 text-body-sm">
          <Link href="/translations" className="focus-ring text-text-secondary underline">
            Translations
          </Link>
          {editor ? (
            <Link href={editor} className="focus-ring text-text-secondary underline">
              Back to the editor
            </Link>
          ) : null}
        </nav>
        <h1 className="text-h1">Translate {name}</h1>
        <p className="max-w-prose text-body text-text-secondary">
          English on one side, {target.label} on the other. Only a confirmed translation counts as
          done, and it stops counting when the English changes.
        </p>
        {overview ? (
          <p className="text-body-sm font-medium">
            {overview.confirmed} of {overview.fields} fields confirmed in {target.label}
          </p>
        ) : null}

        <nav aria-label="Language" className="flex flex-wrap gap-2">
          {targets.map((locale) => (
            <Link
              key={locale.code}
              href={`/translations/${table}/${id}?locale=${locale.code}`}
              aria-current={locale.code === target.code ? "page" : undefined}
              className={buttonVariants({
                size: "sm",
                variant: locale.code === target.code ? "default" : "outline",
              })}
            >
              {locale.label}
            </Link>
          ))}
        </nav>

        {!canEdit ? (
          <p className="text-body-sm text-text-secondary">
            Translating needs the translator, editor or admin role. You can read everything here.
          </p>
        ) : null}
      </header>

      <EntityTranslation
        key={target.code}
        entityTable={table}
        entityId={id}
        locale={target.code}
        localeLabel={target.label}
        rows={rows}
        canEdit={canEdit}
      />
    </div>
  );
}
