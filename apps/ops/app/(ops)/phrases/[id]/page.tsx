import { notFound } from "next/navigation";
import { HistoryLink } from "@/components/history-link";
import { PhraseForm } from "@/components/phrase-form";
import { PublishPanel } from "@/components/publish-panel";
import { licensedAudioOptions } from "@/lib/audio-options";
import { destinationOptions } from "@/lib/destinations";
import { validationProblems } from "@/lib/entity-review";
import { activeLocales } from "@/lib/locales";
import { PHRASE_CONTEXT_VALUES, splitTranslations, type PhraseDraft } from "@/lib/phrase-draft";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Phrase · Mandhira Ops" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPhrasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await opsSupabase();

  const [{ data, error }, locales, destinations, audio, problems] = await Promise.all([
    supabase
      .from("phrases")
      .select(
        "id, destination_id, context_tag, source_locale, source_text, translations, audio_media_id, sort_order, status",
      )
      .eq("id", id)
      .maybeSingle(),
    activeLocales(),
    destinationOptions(),
    licensedAudioOptions(),
    validationProblems("phrases", id),
  ]);

  if (error) throw error;
  if (!data) notFound();

  const initial: PhraseDraft = {
    id: data.id,
    destination_id: data.destination_id,
    context_tag: (PHRASE_CONTEXT_VALUES as readonly string[]).includes(data.context_tag)
      ? (data.context_tag as PhraseDraft["context_tag"])
      : "directions",
    source_locale: data.source_locale,
    source_text: data.source_text,
    ...splitTranslations(data.translations),
    audio_media_id: data.audio_media_id,
    sort_order: data.sort_order,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1" lang={data.source_locale}>
            {data.source_text}
          </h1>
          <p className="mt-1 text-body text-text-secondary">Editing a phrase.</p>
        </div>
        <HistoryLink table="phrases" id={data.id} />
      </header>

      <div className="max-w-2xl">
        <PublishPanel
          entityTable="phrases"
          entityId={data.id}
          status={data.status}
          problems={problems}
        />
      </div>

      <PhraseForm locales={locales} destinations={destinations} audio={audio} initial={initial} />
    </div>
  );
}
