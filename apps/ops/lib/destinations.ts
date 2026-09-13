import { labelOf } from "./entities";
import { opsSupabase } from "./supabase";

/** Destination options for the editors' pickers. A failed read throws rather than looking empty. */
export async function destinationOptions(): Promise<{ id: string; label: string }[]> {
  const supabase = await opsSupabase();
  const { data, error } = await supabase
    .from("destinations")
    .select("id, slug, name_i18n")
    .is("deleted_at", null)
    .order("slug");

  if (error) throw error;
  return data.map((d) => ({ id: d.id, label: labelOf(d.name_i18n, d.slug) }));
}
