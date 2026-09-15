import { notFound } from "next/navigation";
import { CircuitDestinations } from "@/components/circuit-destinations";
import { CircuitForm, type CircuitDraft } from "@/components/circuit-form";
import { HistoryLink } from "@/components/history-link";
import { LoadProblem } from "@/components/load-problem";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Circuit · Mandhira Ops" };

const text = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

/** Circuit editor (PRD F19 circuit builder, OPS-REL-01). */
export default async function EditCircuitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [{ data, error }, membersResult, locales, destinations] = await Promise.all([
    supabase
      .from("circuits")
      .select("id, slug, name_i18n, description_i18n")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("circuit_destinations")
      .select("destination_id, sort_order")
      .eq("circuit_id", id)
      .order("sort_order"),
    activeLocales(),
    destinationOptions(),
  ]);

  if (error || !data) notFound();

  const labels = new Map(destinations.map((destination) => [destination.id, destination.label]));
  const initial: CircuitDraft = {
    id: data.id,
    slug: data.slug,
    name_i18n: text(data.name_i18n),
    description_i18n: text(data.description_i18n),
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">{initial.name_i18n["en"] ?? initial.slug}</h1>
          <p className="mt-1 max-w-prose text-body text-text-secondary">
            Editing a draft circuit. Travelers do not see circuits yet: they arrive with journeys
            across several destinations.
          </p>
        </div>
        <HistoryLink table="circuits" id={data.id} />
      </header>

      <div className="max-w-2xl">
        {membersResult.error ? (
          // Never offer to save an order that could not be read: saving would replace it.
          <LoadProblem />
        ) : (
          <CircuitDestinations
            circuitId={data.id}
            options={destinations}
            initial={(membersResult.data ?? []).map((member) => ({
              destination_id: member.destination_id,
              label: labels.get(member.destination_id) ?? "A destination that has been archived",
            }))}
          />
        )}
      </div>

      <CircuitForm locales={locales} initial={initial} />
    </div>
  );
}
