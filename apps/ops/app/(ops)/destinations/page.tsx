import { Button } from "@mandhira/ui";
import Link from "next/link";
import { DestinationsTable } from "@/components/destinations-table";
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
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : (
        <DestinationsTable rows={data ?? []} />
      )}
    </div>
  );
}
