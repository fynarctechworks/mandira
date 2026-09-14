"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { Input } from "@mandhira/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPhrase, updatePhrase } from "@/app/(ops)/phrases/actions";
import type { AudioOption } from "@/lib/audio-options";
import { PHRASE_CONTEXTS, joinTranslations, type PhraseDraft } from "@/lib/phrase-draft";
import { I18nFields, type LocaleOption } from "./i18n-fields";

/**
 * Phrase editor (O18, PRD-OPS-CNT-004).
 *
 * The phrase and its transliteration are edited as two ordinary locale-tab sets, the same
 * tabs every other editor uses, and joined into `translations` on save. The source language
 * gets no tab in either: the phrase in its own language is the source text above them.
 */
export function PhraseForm({
  locales,
  destinations,
  audio,
  initial,
}: {
  locales: LocaleOption[];
  destinations: { id: string; label: string }[];
  audio: AudioOption[];
  initial: PhraseDraft;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof PhraseDraft>(key: K, value: PhraseDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const translationLocales = locales.filter((locale) => locale.code !== draft.source_locale);
  const translationError = Object.entries(errors).find(([key]) =>
    key.startsWith("translations"),
  )?.[1]?.[0];

  // The linked file may have lost its licence since; say so rather than silently blanking it.
  const audioOptions =
    draft.audio_media_id && !audio.some((a) => a.id === draft.audio_media_id)
      ? [...audio, { id: draft.audio_media_id, label: "Current audio (no licence recorded)" }]
      : audio;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSaved(false);

    const payload = {
      destination_id: draft.destination_id,
      context_tag: draft.context_tag,
      source_locale: draft.source_locale,
      source_text: draft.source_text,
      translations: joinTranslations(
        draft.text_i18n,
        draft.transliteration_i18n,
        draft.source_locale,
      ),
      audio_media_id: draft.audio_media_id,
      sort_order: draft.sort_order,
    };

    startTransition(async () => {
      const result = initial.id
        ? await updatePhrase({ id: initial.id, ...payload })
        : await createPhrase(payload);

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? {});
        setFormError(result.error.message);
        return;
      }
      if (initial.id) {
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/phrases/${result.data.id}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="phrase-destination" className="text-body-sm font-medium">
            Destination
          </label>
          <NativeSelect
            id="phrase-destination"
            className="w-full"
            value={draft.destination_id ?? ""}
            onChange={(e) => set("destination_id", e.target.value || null)}
          >
            <NativeSelectOption value="">Every destination</NativeSelectOption>
            {destinations.map((destination) => (
              <NativeSelectOption key={destination.id} value={destination.id}>
                {destination.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex w-full flex-col sm:w-56 gap-1">
          <label htmlFor="phrase-context" className="text-body-sm font-medium">
            Situation
          </label>
          <NativeSelect
            id="phrase-context"
            className="w-full"
            value={draft.context_tag}
            onChange={(e) => set("context_tag", e.target.value as PhraseDraft["context_tag"])}
          >
            {PHRASE_CONTEXTS.map((context) => (
              <NativeSelectOption key={context.value} value={context.value}>
                {context.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex w-full flex-col sm:w-48 gap-1">
          <label htmlFor="phrase-source-locale" className="text-body-sm font-medium">
            Written in
          </label>
          <NativeSelect
            id="phrase-source-locale"
            className="w-full"
            value={draft.source_locale}
            onChange={(e) => set("source_locale", e.target.value)}
          >
            {locales.map((locale) => (
              <NativeSelectOption key={locale.code} value={locale.code}>
                {locale.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="phrase-source-text" className="text-body-sm font-medium">
            Phrase
          </label>
          <Input
            id="phrase-source-text"
            lang={draft.source_locale}
            value={draft.source_text}
            aria-invalid={errors["source_text"] ? true : undefined}
            aria-describedby={errors["source_text"] ? "phrase-source-text-error" : undefined}
            onChange={(e) => set("source_text", e.target.value)}
          />
          {errors["source_text"] ? (
            <span id="phrase-source-text-error" className="text-body-sm text-destructive">
              {errors["source_text"][0]}
            </span>
          ) : null}
        </div>
      </div>

      {translationLocales.length > 0 ? (
        <>
          <I18nFields
            label="The phrase in each language"
            locales={translationLocales}
            value={draft.text_i18n}
            onChange={(v) => set("text_i18n", v)}
            {...(translationError ? { describedBy: "phrase-translation-error" } : {})}
          />
          <I18nFields
            label="How to say it (in Latin letters)"
            locales={translationLocales}
            value={draft.transliteration_i18n}
            onChange={(v) => set("transliteration_i18n", v)}
          />
          {translationError ? (
            <p id="phrase-translation-error" className="-mt-4 text-body-sm text-destructive">
              {translationError}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-body-sm text-text-secondary">
          Only one language is active, so there is nothing to translate into yet. Activate a locale
          to add translations.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="phrase-audio" className="text-body-sm font-medium">
            Audio
          </label>
          <NativeSelect
            id="phrase-audio"
            className="w-full"
            value={draft.audio_media_id ?? ""}
            onChange={(e) => set("audio_media_id", e.target.value || null)}
            aria-describedby="phrase-audio-hint"
          >
            <NativeSelectOption value="">No audio</NativeSelectOption>
            {audioOptions.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <span id="phrase-audio-hint" className="text-caption text-text-secondary">
            Licensed audio from the media library. Upload and license a recording there first.
          </span>
        </div>
        <div className="flex w-32 flex-col gap-1">
          <label htmlFor="phrase-sort" className="text-body-sm font-medium">
            Order
          </label>
          <Input
            id="phrase-sort"
            type="number"
            min={0}
            max={999}
            value={draft.sort_order}
            onChange={(e) => set("sort_order", Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
      </div>

      <div aria-live="polite">
        {formError ? (
          <p role="alert" className="text-body-sm text-destructive">
            {formError}
          </p>
        ) : null}
        {saved ? <p className="text-body-sm text-text-secondary">Saved.</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {initial.id ? "Save changes" : "Create phrase"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <p className="text-caption text-text-tertiary">
        Saved as a draft. Publishing happens through review and approval, not from this form.
      </p>
    </form>
  );
}
