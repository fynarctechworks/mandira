import { labelOf } from "./entities";
import type { opsSupabase } from "./supabase";

type Client = Awaited<ReturnType<typeof opsSupabase>>;

/** The owner and coverage choices a source form offers (PRD F17). */
export async function sourceFormOptions(supabase: Client) {
  const [colleagues, destinations] = await Promise.all([
    supabase.rpc("ops_colleagues"),
    supabase
      .from("destinations")
      .select("id, slug, name_i18n")
      .is("deleted_at", null)
      .order("slug"),
  ]);

  return {
    colleagues: (colleagues.data ?? [])
      .map((colleague) => ({ id: colleague.user_id, label: colleague.label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    destinations: (destinations.data ?? []).map((destination) => ({
      id: destination.id,
      label: labelOf(destination.name_i18n, destination.slug),
    })),
  };
}
