import { notFound } from "next/navigation";
import { RouteForm, type RouteDraft } from "@/components/route-form";
import { RouteStops, type RouteStop } from "@/components/route-stops";
import { destinationOptions, labelOf } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { placeOptions } from "@/lib/route-draft";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Route · Mandhira Ops" };

const text = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [{ data, error }, locales, destinations, places, stopsResult] = await Promise.all([
    supabase.from("routes").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    activeLocales(),
    destinationOptions(),
    placeOptions(),
    supabase
      .from("route_places")
      .select("place_id, sort_order, is_rest_point, places(slug, name_i18n)")
      .eq("route_id", id)
      .order("sort_order"),
  ]);

  if (error || !data) notFound();

  const stops: RouteStop[] = (stopsResult.data ?? []).map((stop) => {
    const place = stop.places as { slug: string; name_i18n: unknown } | null;
    return {
      place_id: stop.place_id,
      label: place ? labelOf(place.name_i18n, place.slug) : stop.place_id,
      is_rest_point: stop.is_rest_point,
    };
  });

  const initial: RouteDraft = {
    id: data.id,
    destination_id: data.destination_id,
    slug: data.slug,
    name_i18n: text(data.name_i18n),
    mode: data.mode,
    distance_m: data.distance_m,
    duration_min_minutes: data.duration_min_minutes,
    duration_likely_minutes: data.duration_likely_minutes,
    duration_max_minutes: data.duration_max_minutes,
    difficulty: data.difficulty,
    elevation_note_i18n: text(data.elevation_note_i18n),
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-h1">{initial.name_i18n["en"] ?? initial.slug}</h1>
        <p className="mt-1 text-body text-text-secondary">Editing a draft route.</p>
      </header>

      <div className="max-w-2xl">
        <RouteStops routeId={data.id} places={places} initial={stops} />
      </div>

      <RouteForm locales={locales} destinations={destinations} initial={initial} />
    </div>
  );
}
