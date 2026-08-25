import { Button } from "@mandhira/ui";
import Link from "next/link";
import { SourcesTable, type SourceRow } from "@/components/sources-table";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Sources · Mandhira Ops" };

/**
 * Source registry (O08, PRD-OPS-SRC-001).
 *
 * Every verified fact points at a row here, and the tier decides how confident a traveler
 * is told to be. Registering sources is therefore the first step of seeding a destination,
 * not an afterthought.
 */
export default async function SourcesPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("sources")
    .select("id, name, source_type, tier, url, status, refresh_cadence_days")
    .order("tier")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Sources</h1>
          <p className="mt-1 text-body text-text-secondary">
            Where knowledge comes from. A fact can only be verified against a source registered
            here, and the tier decides the confidence travelers see.
          </p>
        </div>
        <Button asChild>
          <Link href="/sources/new">Register a source</Link>
        </Button>
      </header>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : (
        <SourcesTable rows={(data ?? []) as SourceRow[]} />
      )}
    </div>
  );
}
