import type { RouteDraft } from "@/components/route-form";
import { labelOf } from "./destinations";
import { opsSupabase } from "./supabase";

/** Blank route draft. Lives outside the client module so server pages can call it. */
export function emptyRoute(destinationId: string): RouteDraft {
  return {
    destination_id: destinationId,
    slug: "",
    name_i18n: {},
    mode: "walk",
    distance_m: null,
    duration_min_minutes: null,
    duration_likely_minutes: null,
    duration_max_minutes: null,
    difficulty: null,
    elevation_note_i18n: {},
  };
}

/** Places available as route stops or transport endpoints. */
export async function placeOptions(): Promise<{ id: string; label: string }[]> {
  const supabase = await opsSupabase();
  const { data } = await supabase
    .from("places")
    .select("id, slug, name_i18n")
    .is("deleted_at", null)
    .order("slug");

  return (data ?? []).map((p) => ({ id: p.id, label: labelOf(p.name_i18n, p.slug) }));
}
