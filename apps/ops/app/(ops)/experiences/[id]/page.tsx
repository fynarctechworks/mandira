import { notFound } from "next/navigation";
import { HistoryLink } from "@/components/history-link";
import { TranslateLink } from "@/components/translate-link";
import { PreviewInApp } from "@/components/preview-in-app";
import { AvailabilityRules, type AvailabilityRuleRow } from "@/components/availability-rules";
import { ExperienceForm, type ExperienceDraft } from "@/components/experience-form";
import { PublishPanel } from "@/components/publish-panel";
import { journeyImpact } from "@/lib/impact";
import { trustForEntity, validationProblems } from "@/lib/entity-review";
import { TrustSection } from "@/components/trust-section";
import type { TrustRecord } from "@/components/trust-panel";
import { anchorOptions } from "@/lib/anchors";
import { activeSources } from "@/lib/sources";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Experience · Mandhira Ops" };

const text = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

export default async function EditExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [{ data, error }, locales, destinations, anchors, rulesResult, sources, trust, problems] =
    await Promise.all([
      supabase.from("experiences").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
      activeLocales(),
      destinationOptions(),
      anchorOptions(),
      supabase
        .from("availability_rules")
        .select(
          "id, kind, daily_times, weekly_pattern, date_start, date_end, calendar_dates, priority",
        )
        .eq("experience_id", id)
        .order("priority", { ascending: false }),
      activeSources(),
      trustForEntity("experiences", id),
      validationProblems("experiences", id),
    ]);

  if (error || !data) notFound();

  const initial: ExperienceDraft = {
    id: data.id,
    destination_id: data.destination_id,
    place_id: data.place_id,
    route_id: data.route_id,
    slug: data.slug,
    name_i18n: text(data.name_i18n),
    experience_type: data.experience_type,
    significance_i18n: text(data.significance_i18n),
    description_i18n: text(data.description_i18n),
    duration_min_minutes: data.duration_min_minutes,
    duration_likely_minutes: data.duration_likely_minutes,
    duration_max_minutes: data.duration_max_minutes,
    advance_booking_required: data.advance_booking_required,
    advance_booking_how_i18n: text(data.advance_booking_how_i18n),
    advance_booking_opens_days_before: data.advance_booking_opens_days_before,
    eligibility_i18n: text(data.eligibility_i18n),
    cost_note_i18n: text(data.cost_note_i18n),
    queue_expectation_i18n: text(data.queue_expectation_i18n),
    preparation_i18n: text(data.preparation_i18n),
    is_outdoor: data.is_outdoor,
    editorial_weight: data.editorial_weight,
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">{initial.name_i18n["en"] ?? initial.slug}</h1>
          <p className="mt-1 text-body text-text-secondary">Editing a draft experience.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <HistoryLink table="experiences" id={data.id} />
          <TranslateLink table="experiences" id={data.id} />
          <PreviewInApp kind="experiences" id={data.id} locales={locales} />
        </div>
      </header>

      {/* Trust first, then availability: these are the two things most likely to be
          missing, and between them they decide whether a traveler ever sees this at all
          and whether the engine can schedule it. */}
      <div className="max-w-2xl">
        <PublishPanel
          entityTable="experiences"
          entityId={data.id}
          status={data.status}
          problems={problems}
          impact={await journeyImpact("experiences", data.id)}
        />
      </div>

      <div className="max-w-2xl">
        <TrustSection
          entityTable="experiences"
          entityId={data.id}
          sources={sources}
          records={trust as Record<string, TrustRecord | undefined>}
        />
      </div>

      <div className="max-w-2xl">
        <AvailabilityRules
          experienceId={data.id}
          rules={(rulesResult.data ?? []) as AvailabilityRuleRow[]}
        />
      </div>

      <ExperienceForm
        locales={locales}
        destinations={destinations}
        anchors={anchors}
        initial={initial}
      />
    </div>
  );
}
