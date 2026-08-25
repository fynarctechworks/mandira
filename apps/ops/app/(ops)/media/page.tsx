import { MediaLibrary, type MediaRow } from "@/components/media-library";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Media · Mandhira Ops" };

export default async function MediaPage() {
  const supabase = await opsSupabase();

  const { data } = await supabase
    .from("media_assets")
    .select("id, storage_path, media_type, caption_i18n, credit, licence, width, height")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

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

      <MediaLibrary items={(data ?? []) as MediaRow[]} publicBaseUrl={publicBaseUrl} />
    </div>
  );
}
