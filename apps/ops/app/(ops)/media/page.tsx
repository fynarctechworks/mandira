import { LoadProblem } from "@/components/load-problem";
import { MediaLibrary, type MediaRow, type MediaUse } from "@/components/media-library";
import { editorPath, entityNoun, labelOf } from "@/lib/entities";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Media · Mandhira Ops" };

/** O16 — the media library (PRD F19): every asset, its licence, and where it is used. */
export default async function MediaPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "id, storage_path, media_type, caption_i18n, credit, licence, width, height, focal_x, focal_y",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const ids = (data ?? []).map((asset) => asset.id);
  const links = ids.length
    ? await supabase
        .from("entity_media")
        .select("media_id, entity_table, entity_id, role")
        .in("media_id", ids)
    : { data: [], error: null };

  const idsOf = (table: string) => [
    ...new Set((links.data ?? []).filter((l) => l.entity_table === table).map((l) => l.entity_id)),
  ];
  const named = async (table: "destinations" | "places" | "experiences") => {
    const wanted = idsOf(table);
    if (wanted.length === 0) return { data: [], error: null };
    return supabase.from(table).select("id, slug, name_i18n").in("id", wanted);
  };
  const [destinations, places, experiences] = await Promise.all([
    named("destinations"),
    named("places"),
    named("experiences"),
  ]);

  const labels = new Map<string, string>();
  for (const [table, result] of [
    ["destinations", destinations],
    ["places", places],
    ["experiences", experiences],
  ] as const) {
    for (const row of result.data ?? [])
      labels.set(`${table}:${row.id}`, labelOf(row.name_i18n, row.slug));
  }

  const usage = new Map<string, MediaUse[]>();
  for (const link of links.data ?? []) {
    const list = usage.get(link.media_id) ?? [];
    list.push({
      label: `${entityNoun(link.entity_table)}: ${labels.get(`${link.entity_table}:${link.entity_id}`) ?? "unnamed"}`,
      href: editorPath(link.entity_table, link.entity_id),
      role: link.role,
    });
    usage.set(link.media_id, list);
  }

  const failed = error || links.error || destinations.error || places.error || experiences.error;
  const publicBaseUrl = `${process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? ""}/storage/v1/object/public/media`;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">Media</h1>
        <p className="mt-1 text-body text-text-secondary">
          Images and audio used across the app. Every item needs a licence — anything without one
          blocks publication of whatever it is attached to.
        </p>
      </header>

      {failed ? (
        <LoadProblem />
      ) : (
        <MediaLibrary
          items={(data ?? []).map((asset) => ({
            ...(asset as Omit<MediaRow, "usage">),
            usage: usage.get(asset.id) ?? [],
          }))}
          publicBaseUrl={publicBaseUrl}
        />
      )}
    </div>
  );
}
