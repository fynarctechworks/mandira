import { uuid } from "@mandhira/db";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LoadProblem } from "@/components/load-problem";
import { MediaFocalEditor } from "@/components/media-focal-editor";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Media item · Mandhira Ops" };

/**
 * O16 detail — one asset and its framing (PRD-OPS-CNT-003).
 *
 * The crop presets are ratios, not separate files (D-055, migration 0036): the operator
 * says where the subject is, and every preset keeps that point in frame. The previews on
 * this screen render exactly as travelers' screens will.
 */
export default async function MediaItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();

  const supabase = await opsSupabase();
  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "id, storage_path, media_type, caption_i18n, credit, licence, width, height, focal_x, focal_y",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const back = (
    <Link
      href="/media"
      className="focus-ring inline-flex min-h-11 items-center text-body-sm underline"
    >
      Back to media
    </Link>
  );

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <h1 className="text-h1">Media item</h1>
        <LoadProblem />
      </div>
    );
  }
  if (!data) notFound();

  const captions = (data.caption_i18n ?? {}) as Record<string, string>;
  const caption = captions["en"] ?? Object.values(captions).find((value) => value.trim() !== "");
  const publicUrl = `${process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? ""}/storage/v1/object/public/media/${data.storage_path}`;

  return (
    <div className="flex flex-col gap-6">
      {back}

      <header className="flex flex-col gap-1">
        <h1 className="text-h1">{caption ?? "Untitled media"}</h1>
        <p className="text-body-sm text-text-secondary">
          {data.media_type}
          {data.width && data.height ? ` · ${data.width} × ${data.height}` : ""}
          {data.licence ? ` · ${data.licence}` : " · No licence"}
          {data.credit ? ` · ${data.credit}` : ""}
        </p>
      </header>

      {data.media_type === "image" ? (
        <MediaFocalEditor
          id={data.id}
          src={publicUrl}
          alt={caption ?? "Uploaded image"}
          initial={{ x: data.focal_x, y: data.focal_y }}
        />
      ) : (
        <p className="text-body text-text-secondary">
          Framing applies to images only. This item is {data.media_type}, so there is nothing to
          crop.
        </p>
      )}
    </div>
  );
}
