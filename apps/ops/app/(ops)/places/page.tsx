import { Button } from "@mandhira/ui";
import Link from "next/link";
import { PlacesTable, type PlaceRow } from "@/components/places-table";
import { labelOf } from "@/lib/destinations";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Places · Mandhira Ops" };

export default async function PlacesPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("places")
    .select(
      "id, slug, name_i18n, place_type, status, opening_schedule, destinations(slug, name_i18n)",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const rows: PlaceRow[] = (data ?? []).map((place) => {
    const destination = place.destinations as { slug: string; name_i18n: unknown } | null;
    return {
      id: place.id,
      slug: place.slug,
      name_i18n: place.name_i18n,
      place_type: place.place_type,
      status: place.status,
      destination_label: destination ? labelOf(destination.name_i18n, destination.slug) : "—",
      has_schedule: place.opening_schedule != null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Places</h1>
          <p className="mt-1 text-body text-text-secondary">
            Temples, shrines, ghats and facilities. Experiences attach to these.
          </p>
        </div>
        <Button asChild>
          <Link href="/places/new">New place</Link>
        </Button>
      </header>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : (
        <PlacesTable rows={rows} />
      )}
    </div>
  );
}
