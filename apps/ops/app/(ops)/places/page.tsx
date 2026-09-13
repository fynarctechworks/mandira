import { Button } from "@mandhira/ui";
import Link from "next/link";
import { EntityTable, type EntityRow } from "@/components/entity-table";
import { LoadProblem } from "@/components/load-problem";
import { labelOf } from "@/lib/entities";
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

  const rows: EntityRow[] = (data ?? []).map((place) => {
    const destination = place.destinations as { slug: string; name_i18n: unknown } | null;
    return {
      id: place.id,
      slug: place.slug,
      name_i18n: place.name_i18n,
      status: place.status,
      columns: {
        Destination: destination ? labelOf(destination.name_i18n, destination.slug) : "—",
        Type: place.place_type.replace(/_/g, " "),
        // Opening hours gate publication, so their absence belongs in the list rather than
        // being discovered at approval time.
        Hours: place.opening_schedule != null ? "● Recorded" : "○ Missing",
      },
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
        <LoadProblem />
      ) : (
        <EntityTable
          caption="Places"
          basePath="/places"
          rows={rows}
          columnOrder={["Destination", "Type", "Hours"]}
          emptyTitle="No places yet"
          emptyBody="Add the temples, ghats and facilities travelers will visit."
        />
      )}
    </div>
  );
}
