import type { AnchorOption } from "@/components/experience-form";
import { labelOf } from "./destinations";
import { opsSupabase } from "./supabase";

/**
 * Places and routes an experience can anchor to, in one list.
 *
 * Combined deliberately: the database allows exactly one anchor, so offering a single
 * choice makes the invalid state unreachable rather than merely rejected.
 */
export async function anchorOptions(): Promise<AnchorOption[]> {
  const supabase = await opsSupabase();

  const [places, routes] = await Promise.all([
    supabase.from("places").select("id, slug, name_i18n").is("deleted_at", null).order("slug"),
    supabase.from("routes").select("id, slug, name_i18n").is("deleted_at", null).order("slug"),
  ]);

  return [
    ...(places.data ?? []).map((p) => ({
      id: p.id,
      label: labelOf(p.name_i18n, p.slug),
      kind: "place" as const,
    })),
    ...(routes.data ?? []).map((r) => ({
      id: r.id,
      label: labelOf(r.name_i18n, r.slug),
      kind: "route" as const,
    })),
  ];
}
