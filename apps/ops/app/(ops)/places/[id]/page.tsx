import type { CrowdPattern, OpeningSchedule } from "@mandhira/db";
import { notFound } from "next/navigation";
import { PlaceForm, type PlaceDraft } from "@/components/place-form";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Place · Mandhira Ops" };

const text = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

export default async function EditPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [{ data, error }, locales, destinations] = await Promise.all([
    supabase
      .from("places")
      .select("*, latitude, longitude")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    activeLocales(),
    destinationOptions(),
  ]);

  if (error || !data) notFound();

  const initial: PlaceDraft = {
    id: data.id,
    destination_id: data.destination_id,
    slug: data.slug,
    name_i18n: text(data.name_i18n),
    place_type: data.place_type,
    facility_subtype: data.facility_subtype,
    address: data.address,
    summary_i18n: text(data.summary_i18n),
    opening_schedule: (data.opening_schedule as OpeningSchedule | null) ?? {},
    closure_rules_i18n: text(data.closure_rules_i18n),
    entry_requirements_i18n: text(data.entry_requirements_i18n),
    dress_code_i18n: text(data.dress_code_i18n),
    visit_duration_min_minutes: data.visit_duration_min_minutes,
    visit_duration_likely_minutes: data.visit_duration_likely_minutes,
    visit_duration_max_minutes: data.visit_duration_max_minutes,
    crowd_pattern: (data.crowd_pattern as CrowdPattern | null) ?? {},
    hours_note_i18n: text(data.hours_note_i18n),
    editorial_weight: data.editorial_weight,
    latitude: data.latitude,
    longitude: data.longitude,
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">{initial.name_i18n["en"] ?? initial.slug}</h1>
        <p className="mt-1 text-body text-text-secondary">Editing a draft place.</p>
      </header>
      <PlaceForm locales={locales} destinations={destinations} initial={initial} />
    </div>
  );
}
