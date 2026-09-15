import { Button } from "@mandhira/ui";
import Link from "next/link";
import { EntityTable, type EntityRow } from "@/components/entity-table";
import { LoadProblem } from "@/components/load-problem";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Circuits · Mandhira Ops" };

/**
 * Circuits list (PRD F19 circuit builder, OPS-REL-01). Reads the base tables: circuits are
 * drafts until multi-destination journeys bring them to travelers.
 */
export default async function CircuitsPage() {
  const supabase = await opsSupabase();

  const [circuits, members] = await Promise.all([
    supabase
      .from("circuits")
      .select("id, slug, name_i18n, status, updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("circuit_destinations").select("circuit_id"),
  ]);

  const counts = new Map<string, number>();
  for (const member of members.data ?? []) {
    counts.set(member.circuit_id, (counts.get(member.circuit_id) ?? 0) + 1);
  }

  const rows: EntityRow[] = (circuits.data ?? []).map((circuit) => ({
    id: circuit.id,
    slug: circuit.slug,
    name_i18n: circuit.name_i18n,
    status: circuit.status,
    columns: {
      Slug: circuit.slug,
      Destinations: String(counts.get(circuit.id) ?? 0),
      Updated: new Date(circuit.updated_at).toLocaleDateString("en-IN"),
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Circuits</h1>
          <p className="mt-1 max-w-prose text-body text-text-secondary">
            Destinations a pilgrimage takes in order, such as a yatra. Travelers do not see circuits
            yet: they arrive with journeys across several destinations.
          </p>
        </div>
        <Button asChild>
          <Link href="/circuits/new">New circuit</Link>
        </Button>
      </header>

      {circuits.error || members.error ? (
        <LoadProblem />
      ) : (
        <EntityTable
          caption="Circuits"
          basePath="/circuits"
          rows={rows}
          columnOrder={["Slug", "Destinations", "Updated"]}
          emptyTitle="No circuits yet"
          emptyBody="Create one, then add its destinations in order."
        />
      )}
    </div>
  );
}
