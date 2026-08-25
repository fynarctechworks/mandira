import type { LocaleOption } from "@/components/i18n-fields";
import { opsSupabase } from "./supabase";

/**
 * Active locales, ordered, for the `_i18n` editors.
 *
 * Read from the database rather than hardcoded, so adding a language is inserting a
 * `locales` row — no code change anywhere in the editors (D-028, PRD-LANG-002).
 */
export async function activeLocales(): Promise<LocaleOption[]> {
  const supabase = await opsSupabase();
  const { data, error } = await supabase
    .from("locales")
    .select("code, name_en, name_native")
    .eq("is_active", true)
    .order("sort_order");

  // A failure here should not blank the whole editor: English always exists (0002 seeds
  // it), so fall back to it rather than rendering a form with no language tabs at all.
  if (error || !data || data.length === 0) {
    return [{ code: "en", label: "English" }];
  }

  return data.map((locale) => ({
    code: locale.code,
    label: locale.name_native === locale.name_en ? locale.name_en : `${locale.name_en}`,
  }));
}
