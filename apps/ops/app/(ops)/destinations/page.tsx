import { Button } from "@mandhira/ui";
import Link from "next/link";
import { EntityTable, type EntityRow } from "@/components/entity-table";
import { LoadProblem } from "@/components/load-problem";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Destinations · Mandhira Ops" };

/**
 * Destinations list (O02).
 *
 * Reads the base table, not `v_published_destinations`: Ops works on drafts, which is
 * exactly what the published view is designed to hide. RLS (0008) restricts this to
 * operators.
 */
export default async function DestinationsPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("destinations")
    .select("id, slug, name_i18n, region, state, status, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const rows: EntityRow[] = (data ?? []).map((destination) => ({
    id: destination.id,
    slug: destination.slug,
    name_i18n: destination.name_i18n,
    status: destination.status,
    columns: {
      Slug: destination.slug,
      Region: [destination.region, destination.state].filter(Boolean).join(", ") || "—",
      Updated: new Date(destination.updated_at).toLocaleDateString("en-IN"),
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Destinations</h1>
          <p className="mt-1 text-body text-text-secondary">
            Pilgrimage localities. Everything else — places, experiences, routes — hangs off one of
            these.
          </p>
        </div>
        <Button asChild>
          <Link href="/destinations/new">New destination</Link>
        </Button>
      </header>

      {error ? (
        <LoadProblem />
      ) : (
        <EntityTable
          caption="Destinations"
          basePath="/destinations"
          rows={rows}
          columnOrder={["Slug", "Region", "Updated"]}
          emptyTitle="No destinations yet"
          emptyBody="Create one to start adding places and experiences."
        />
      )}
    </div>
  );
}
