import { notFound } from "next/navigation";
import { HistoryLink } from "@/components/history-link";
import { DestinationForm, type DestinationDraft } from "@/components/destination-form";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Destination · Mandhira Ops" };

const text = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

export default async function EditDestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [{ data, error }, locales] = await Promise.all([
    supabase
      .from("destinations")
      .select("*, latitude, longitude")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    activeLocales(),
  ]);

  if (error || !data) notFound();

  const initial: DestinationDraft = {
    id: data.id,
    slug: data.slug,
    name_i18n: text(data.name_i18n),
    region: data.region,
    state: data.state,
    country: data.country,
    overview_i18n: text(data.overview_i18n),
    best_seasons_i18n: text(data.best_seasons_i18n),
    seasonal_notes_i18n: text(data.seasonal_notes_i18n),
    radius_km: Number(data.radius_km),
    editorial_weight: data.editorial_weight,
    latitude: data.latitude,
    longitude: data.longitude,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">{initial.name_i18n["en"] ?? initial.slug}</h1>
          <p className="mt-1 text-body text-text-secondary">Editing a draft destination.</p>
        </div>
        <HistoryLink table="destinations" id={data.id} />
      </header>
      <DestinationForm locales={locales} initial={initial} />
    </div>
  );
}
