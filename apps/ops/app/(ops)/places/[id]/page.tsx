import type { CrowdPattern, OpeningSchedule } from "@mandhira/db";
import { HistoryLink } from "@/components/history-link";
import { TranslateLink } from "@/components/translate-link";
import { PreviewInApp } from "@/components/preview-in-app";
import { notFound } from "next/navigation";
import { AccessibilityPanel, type AccessibilityValues } from "@/components/accessibility-panel";
import { PlaceConnections, type PlaceConnectionsData } from "@/components/place-connections";
import { PublishPanel } from "@/components/publish-panel";
import { journeyImpact } from "@/lib/impact";
import { trustForEntity, validationProblems } from "@/lib/entity-review";
import { TrustSection } from "@/components/trust-section";
import type { TrustRecord } from "@/components/trust-panel";
import { activeSources } from "@/lib/sources";
import { PlaceForm, type PlaceDraft } from "@/components/place-form";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Place · Mandhira Ops" };

/** Existing accessibility record, or an all-"not recorded" starting point. */
function toAccessibility(row: Record<string, unknown> | null): AccessibilityValues {
  return {
    step_free: (row?.["step_free"] as string | null) ?? null,
    wheelchair_access: (row?.["wheelchair_access"] as string | null) ?? null,
    queue_assistance: (row?.["queue_assistance"] as boolean | null) ?? null,
    rest_seating: (row?.["rest_seating"] as boolean | null) ?? null,
    distance_from_dropoff_m: (row?.["distance_from_dropoff_m"] as number | null) ?? null,
    notes_i18n: (row?.["notes_i18n"] as Record<string, string> | null) ?? {},
  };
}

const text = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

export default async function EditPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [
    { data, error },
    accessResult,
    locales,
    destinations,
    sources,
    trust,
    problems,
    connections,
  ] = await Promise.all([
    supabase
      .from("places")
      .select("*, latitude, longitude")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("accessibility_records").select("*").eq("place_id", id).maybeSingle(),
    activeLocales(),
    destinationOptions(),
    activeSources(),
    trustForEntity("places", id),
    validationProblems("places", id),
    supabase.rpc("ops_place_connections", { p_place_id: id }),
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">{initial.name_i18n["en"] ?? initial.slug}</h1>
          <p className="mt-1 text-body text-text-secondary">Editing a draft place.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <HistoryLink table="places" id={data.id} />
          <TranslateLink table="places" id={data.id} />
          <PreviewInApp kind="places" id={data.id} locales={locales} />
        </div>
      </header>
      <div className="max-w-2xl">
        <PublishPanel
          entityTable="places"
          entityId={data.id}
          status={data.status}
          problems={problems}
          impact={await journeyImpact("places", data.id)}
        />
      </div>

      <div className="max-w-2xl">
        <TrustSection
          entityTable="places"
          entityId={data.id}
          sources={sources}
          records={trust as Record<string, TrustRecord | undefined>}
        />
      </div>

      <div className="max-w-2xl">
        <PlaceConnections
          data={
            connections.error
              ? null
              : ((connections.data as unknown as PlaceConnectionsData | null) ?? null)
          }
        />
      </div>

      <div className="max-w-2xl">
        <AccessibilityPanel
          locales={locales}
          target={{ placeId: data.id }}
          initial={toAccessibility(accessResult.data)}
        />
      </div>

      <PlaceForm locales={locales} destinations={destinations} initial={initial} />
    </div>
  );
}
