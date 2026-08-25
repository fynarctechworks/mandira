import { Button } from "@mandhira/ui";
import Link from "next/link";
import { EntityTable, type EntityRow } from "@/components/entity-table";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Experiences · Mandhira Ops" };

export default async function ExperiencesPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("experiences")
    .select(
      "id, slug, name_i18n, experience_type, status, advance_booking_required, availability_rules(id)",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const rows: EntityRow[] = (data ?? []).map((experience) => {
    const rules = (experience.availability_rules as { id: string }[] | null) ?? [];
    return {
      id: experience.id,
      slug: experience.slug,
      name_i18n: experience.name_i18n,
      status: experience.status,
      columns: {
        Type: experience.experience_type.replace(/_/g, " "),
        Booking: experience.advance_booking_required ? "Required" : "—",
        // Availability gates scheduling entirely, so its absence belongs in the list
        // rather than being discovered at approval time.
        Availability: rules.length > 0 ? `${rules.length} rule(s)` : "○ None",
      },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Experiences</h1>
          <p className="mt-1 text-body text-text-secondary">
            What a traveler actually does — darshan, aarti, seva, a walk. Each needs availability
            before the engine can schedule it.
          </p>
        </div>
        <Button asChild>
          <Link href="/experiences/new">New experience</Link>
        </Button>
      </header>

      {error ? (
        <p role="alert" className="text-body text-status-tight">
          That list didn&apos;t load. Please refresh to try again.
        </p>
      ) : (
        <EntityTable
          caption="Experiences"
          basePath="/experiences"
          rows={rows}
          columnOrder={["Type", "Booking", "Availability"]}
          emptyTitle="No experiences yet"
          emptyBody="Add the rituals, darshan slots and walks travelers come for."
        />
      )}
    </div>
  );
}
