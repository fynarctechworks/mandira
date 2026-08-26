import { notFound } from "next/navigation";
import { SourceForm, type SourceDraft } from "@/components/source-form";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Source · Mandhira Ops" };

export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const { data, error } = await supabase.from("sources").select("*").eq("id", id).maybeSingle();
  if (error || !data) notFound();

  const initial: SourceDraft = {
    id: data.id,
    name: data.name,
    source_type: data.source_type as SourceDraft["source_type"],
    tier: data.tier,
    url: data.url ?? "",
    contact: data.contact ?? "",
    refresh_cadence_days: data.refresh_cadence_days,
    // `api` and `file_upload` exist in the schema but nothing runs them, so a source
    // carrying one reads as manual here rather than offering a method that does nothing.
    ingestion_method: data.ingestion_method === "url_monitor" ? "url_monitor" : "manual",
    status: data.status as SourceDraft["status"],
    notes: data.notes ?? "",
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">{initial.name}</h1>
        <p className="mt-1 text-body text-text-secondary">Editing a registered source.</p>
      </header>
      <SourceForm initial={initial} />
    </div>
  );
}
