import { opsSupabase } from "./supabase";

/** English-first label with a slug fallback, shared by the pickers and list columns. */
export function labelOf(nameI18n: unknown, slug: string): string {
  if (nameI18n && typeof nameI18n === "object") {
    const record = nameI18n as Record<string, unknown>;
    for (const key of ["en", ...Object.keys(record)]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
  }
  return slug;
}

/** Destination options for the place editor's picker. */
export async function destinationOptions(): Promise<{ id: string; label: string }[]> {
  const supabase = await opsSupabase();
  const { data } = await supabase
    .from("destinations")
    .select("id, slug, name_i18n")
    .is("deleted_at", null)
    .order("slug");

  return (data ?? []).map((d) => ({ id: d.id, label: labelOf(d.name_i18n, d.slug) }));
}
