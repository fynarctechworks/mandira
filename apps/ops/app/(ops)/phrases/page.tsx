import { Button } from "@mandhira/ui/components/ui/button";
import Link from "next/link";
import { EntityTable, type EntityRow } from "@/components/entity-table";
import { LoadProblem } from "@/components/load-problem";
import { labelOf } from "@/lib/entities";
import { contextLabel, splitTranslations } from "@/lib/phrase-draft";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Phrase packs · Mandhira Ops" };

/**
 * O18 — phrase packs (PRD F12/F19, PRD-OPS-CNT-004): the phrases a traveler can show or play
 * when they need to ask for directions, help, a doctor or a place to sit.
 */
export default async function PhrasesPage() {
  const supabase = await opsSupabase();

  const { data, error } = await supabase
    .from("phrases")
    .select(
      "id, source_text, source_locale, context_tag, translations, audio_media_id, status, destinations(slug, name_i18n)",
    )
    .order("updated_at", { ascending: false });

  const rows: EntityRow[] = (data ?? []).map((phrase) => {
    const destination = phrase.destinations as { slug: string; name_i18n: unknown } | null;
    const translated = Object.keys(splitTranslations(phrase.translations).text_i18n);
    return {
      id: phrase.id,
      slug: phrase.source_text,
      name_i18n: null,
      status: phrase.status,
      columns: {
        Situation: contextLabel(phrase.context_tag),
        Destination: destination
          ? labelOf(destination.name_i18n, destination.slug)
          : "Every destination",
        Languages:
          translated.length > 0
            ? `${phrase.source_locale} → ${translated.join(", ")}`
            : `${phrase.source_locale} only`,
        // Icon and text, never colour alone (PRD §12.8).
        Audio: phrase.audio_media_id ? "● Audio" : "○ None",
      },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">Phrase packs</h1>
          <p className="mt-1 text-body text-text-secondary">
            Short phrases travelers can play or show to someone, grouped by situation. A phrase with
            no destination is offered everywhere.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/phrases/new" />}>
          New phrase
        </Button>
      </header>

      {error ? (
        <LoadProblem />
      ) : (
        <EntityTable
          caption="Phrases"
          basePath="/phrases"
          rows={rows}
          columnOrder={["Situation", "Destination", "Languages", "Audio"]}
          emptyTitle="No phrases"
          emptyBody="Add the phrases a traveler needs most: asking directions, finding water, asking for help."
        />
      )}
    </div>
  );
}
