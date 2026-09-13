import { notFound } from "next/navigation";
import { AdvisoryForm, type AdvisoryDraft } from "@/components/advisory-form";
import { HistoryLink } from "@/components/history-link";
import { PublishPanel } from "@/components/publish-panel";
import { destinationOptions } from "@/lib/destinations";
import { validationProblems } from "@/lib/entity-review";
import { labelOf } from "@/lib/entities";
import { activeLocales } from "@/lib/locales";
import { activeSources } from "@/lib/sources";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Advisory · Mandhira Ops" };

const text = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

export default async function EditAdvisoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await opsSupabase();

  const [{ data, error }, locales, destinations, sources, problems] = await Promise.all([
    supabase
      .from("advisories")
      .select(
        "id, destination_id, title_i18n, body_i18n, severity, starts_at, ends_at, source_id, status",
      )
      .eq("id", id)
      .maybeSingle(),
    activeLocales(),
    destinationOptions(),
    activeSources(),
    validationProblems("advisories", id),
  ]);

  if (error) throw error;
  if (!data) notFound();

  const initial: AdvisoryDraft = {
    id: data.id,
    destination_id: data.destination_id,
    title_i18n: text(data.title_i18n),
    body_i18n: text(data.body_i18n),
    severity: data.severity as AdvisoryDraft["severity"],
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    source_id: data.source_id,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">{labelOf(initial.title_i18n, "Untitled advisory")}</h1>
          <p className="mt-1 text-body text-text-secondary">Editing an advisory.</p>
        </div>
        <HistoryLink table="advisories" id={data.id} />
      </header>

      <div className="max-w-2xl">
        <PublishPanel
          entityTable="advisories"
          entityId={data.id}
          status={data.status}
          problems={problems}
        />
      </div>

      <AdvisoryForm
        locales={locales}
        destinations={destinations}
        sources={sources}
        initial={initial}
      />
    </div>
  );
}
