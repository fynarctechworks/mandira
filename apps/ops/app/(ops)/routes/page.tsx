import { Button } from "@mandhira/ui";
import Link from "next/link";
import { EntityTable, type EntityRow } from "@/components/entity-table";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Routes · Mandhira Ops" };

export default async function RoutesPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("routes")
    .select("id, slug, name_i18n, mode, difficulty, status, route_places(place_id)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const rows: EntityRow[] = (data ?? []).map((route) => ({
    id: route.id,
    slug: route.slug,
    name_i18n: route.name_i18n,
    status: route.status,
    columns: {
      Mode: route.mode.replace(/_/g, " "),
      Difficulty: route.difficulty ?? "—",
      Stops: String(((route.route_places as { place_id: string }[] | null) ?? []).length),
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Routes</h1>
          <p className="mt-1 text-body text-text-secondary">
            Walks and paths between places, with their stops in order of travel.
          </p>
        </div>
        <Button asChild>
          <Link href="/routes/new">New route</Link>
        </Button>
      </header>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : (
        <EntityTable
          caption="Routes"
          basePath="/routes"
          rows={rows}
          columnOrder={["Mode", "Difficulty", "Stops"]}
          emptyTitle="No routes yet"
          emptyBody="Add the parikrama paths and walks between places."
        />
      )}
    </div>
  );
}
