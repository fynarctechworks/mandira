import { labelOf } from "./entities";
import { opsSupabase } from "./supabase";

export type AudioOption = { id: string; label: string };

/**
 * Audio a phrase can be linked to (PRD-OPS-CNT-004 "phrase editor + audio").
 *
 * Licensed audio only. The published view plays nothing else (0035), and the save action
 * refuses anything else, so offering an unlicensed file would be offering a choice that does
 * nothing. Uploading and licensing audio happens in the media library (O16).
 */
export async function licensedAudioOptions(): Promise<AudioOption[]> {
  const supabase = await opsSupabase();
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_path, caption_i18n, licence")
    .eq("media_type", "audio")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data
    .filter((asset) => (asset.licence ?? "").trim() !== "")
    .map((asset) => ({
      id: asset.id,
      label: labelOf(
        asset.caption_i18n,
        asset.storage_path.split("/").at(-1) ?? asset.storage_path,
      ),
    }));
}
