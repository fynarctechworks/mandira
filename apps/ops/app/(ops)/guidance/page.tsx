import {
  GuidanceEditor,
  type GuidanceRow,
  type GuidanceTarget,
} from "@/components/guidance-editor";
import { LoadProblem } from "@/components/load-problem";
import { labelOf } from "@/lib/entities";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Guidance · Mandhira Ops" };

/**
 * Guidance blocks (O07).
 *
 * A single screen rather than list-plus-editor: guidance is short, attaches to something
 * else, and is almost always written in batches ("everything a first-time visitor to this
 * temple should know"). Making an operator open a separate page per note would be friction
 * with nothing behind it.
 */
export default async function GuidancePage() {
  const supabase = await opsSupabase();

  const [locales, blocks, destinations, places, experiences] = await Promise.all([
    activeLocales(),
    supabase
      .from("guidance_blocks")
      .select("id, guidance_type, body_i18n, applies_to_table, applies_to_id, sort_order, status")
      .is("deleted_at", null)
      .order("sort_order"),
    supabase.from("destinations").select("id, slug, name_i18n").is("deleted_at", null),
    supabase.from("places").select("id, slug, name_i18n").is("deleted_at", null),
    supabase.from("experiences").select("id, slug, name_i18n").is("deleted_at", null),
  ]);

  const targets: GuidanceTarget[] = [
    ...(destinations.data ?? []).map((d) => ({
      table: "destinations" as const,
      id: d.id,
      label: labelOf(d.name_i18n, d.slug),
    })),
    ...(places.data ?? []).map((p) => ({
      table: "places" as const,
      id: p.id,
      label: labelOf(p.name_i18n, p.slug),
    })),
    ...(experiences.data ?? []).map((e) => ({
      table: "experiences" as const,
      id: e.id,
      label: labelOf(e.name_i18n, e.slug),
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">Guidance</h1>
        <p className="mt-1 text-body text-text-secondary">
          Practical notes attached to a destination, place or experience. These become Prepare tasks
          and in-journey reminders.
        </p>
      </header>

      {blocks.error || destinations.error || places.error || experiences.error ? (
        <LoadProblem />
      ) : (
        <GuidanceEditor
          locales={locales}
          targets={targets}
          blocks={(blocks.data ?? []) as GuidanceRow[]}
        />
      )}
    </div>
  );
}
