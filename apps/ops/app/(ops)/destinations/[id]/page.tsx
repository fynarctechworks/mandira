import { notFound } from "next/navigation";
import { HistoryLink } from "@/components/history-link";
import { LoadProblem } from "@/components/load-problem";
import { NearbyDestinations } from "@/components/nearby-destinations";
import { TranslateLink } from "@/components/translate-link";
import { DestinationForm, type DestinationDraft } from "@/components/destination-form";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Destination · Mandhira Ops" };

const text = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

export default async function EditDestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [{ data, error }, locales, linksResult, destinations] = await Promise.all([
    supabase
      .from("destinations")
      .select("*, latitude, longitude")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    activeLocales(),
    supabase
      .from("destination_links")
      .select("nearby_destination_id, note_i18n")
      .eq("destination_id", id),
    destinationOptions(),
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

  const labels = new Map(destinations.map((destination) => [destination.id, destination.label]));
  const nearby = (linksResult.data ?? [])
    .map((link) => ({
      nearby_destination_id: link.nearby_destination_id,
      label: labels.get(link.nearby_destination_id) ?? "A destination that has been archived",
      note_i18n: text(link.note_i18n),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">{initial.name_i18n["en"] ?? initial.slug}</h1>
          <p className="mt-1 text-body text-text-secondary">Editing a draft destination.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <HistoryLink table="destinations" id={data.id} />
          <TranslateLink table="destinations" id={data.id} />
        </div>
      </header>

      <div className="max-w-2xl">
        {linksResult.error ? (
          // Never offer to save links that could not be read: saving would replace them.
          <LoadProblem />
        ) : (
          <NearbyDestinations
            destinationId={data.id}
            locales={locales}
            options={destinations.filter((destination) => destination.id !== data.id)}
            initial={nearby}
          />
        )}
      </div>

      <DestinationForm locales={locales} initial={initial} />
    </div>
  );
}
