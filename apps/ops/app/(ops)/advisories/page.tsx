import { Button } from "@mandhira/ui/components/ui/button";
import Link from "next/link";
import { EntityTable, type EntityRow } from "@/components/entity-table";
import { LoadProblem } from "@/components/load-problem";
import { labelOf } from "@/lib/entities";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Advisories · Mandhira Ops" };

const SEVERITY: Record<string, string> = {
  info: "ⓘ Information",
  caution: "△ Caution",
  important: "▲ Important",
};

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );

/** O19 — Advisories (PRD F20, PRD-OPS-MON-003): destination notices with start and end dates. */
export default async function AdvisoriesPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("advisories")
    .select("id, title_i18n, severity, starts_at, ends_at, status, destinations(slug, name_i18n)")
    .order("updated_at", { ascending: false });

  const rows: EntityRow[] = (data ?? []).map((advisory) => {
    const destination = advisory.destinations as { slug: string; name_i18n: unknown } | null;
    return {
      id: advisory.id,
      slug: "Untitled advisory",
      name_i18n: advisory.title_i18n,
      status: advisory.status,
      columns: {
        Destination: destination ? labelOf(destination.name_i18n, destination.slug) : "—",
        Severity: SEVERITY[advisory.severity] ?? advisory.severity,
        Window:
          advisory.starts_at || advisory.ends_at
            ? `${advisory.starts_at ? day(advisory.starts_at) : "Now"} – ${advisory.ends_at ? day(advisory.ends_at) : "no end"}`
            : "No dates",
      },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Advisories</h1>
          <p className="mt-1 text-body text-text-secondary">
            Notices for a destination — a closure, a festival crowd, a road that is out — shown to
            travelers for the dates they cover once published.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/advisories/new" />}>
          New advisory
        </Button>
      </header>

      {error ? (
        <LoadProblem />
      ) : (
        <EntityTable
          caption="Advisories"
          basePath="/advisories"
          rows={rows}
          columnOrder={["Destination", "Severity", "Window"]}
          emptyTitle="No advisories"
          emptyBody="Write one when travelers to a destination need to know something for a while."
        />
      )}
    </div>
  );
}
