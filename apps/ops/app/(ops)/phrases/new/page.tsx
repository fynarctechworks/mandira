import { PhraseForm } from "@/components/phrase-form";
import { licensedAudioOptions } from "@/lib/audio-options";
import { destinationOptions } from "@/lib/destinations";
import { activeLocales } from "@/lib/locales";
import { emptyPhrase } from "@/lib/phrase-draft";

export const metadata = { title: "New phrase · Mandhira Ops" };

export default async function NewPhrasePage() {
  const [locales, destinations, audio] = await Promise.all([
    activeLocales(),
    destinationOptions(),
    licensedAudioOptions(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">New phrase</h1>
        <p className="mt-1 text-body text-text-secondary">
          Saved as a draft. Nothing reaches travelers until it is approved and published.
        </p>
      </header>
      <PhraseForm
        locales={locales}
        destinations={destinations}
        audio={audio}
        initial={{
          ...emptyPhrase(destinations[0]?.id ?? null),
          source_locale: locales[0]?.code ?? "en",
        }}
      />
    </div>
  );
}
