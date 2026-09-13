"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@mandhira/ui/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@mandhira/ui/components/ui/tabs";
import { Maximize2, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { showText, type PhraseGroup, type PresentedPhrase } from "../lib/phrases";

/**
 * Phrase assistance (PRD F12, A17): context tabs, phrases, audio, "Show to someone".
 *
 * Used by the destination's phrase page and by the Live screen's sheet, with the same groups
 * either way — online from the published view, offline from what the snapshot stored.
 *
 * Nothing here changes a journey, so nothing here needs a confirmation. Playing a phrase and
 * holding it up for someone to read are the whole job.
 */
export function PhraseAssistance({ groups, locale }: { groups: PhraseGroup[]; locale: string }) {
  const t = useTranslations("phrases");
  const [showing, setShowing] = useState<PresentedPhrase | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  // A phrase still playing after the screen is gone is a phrase nobody asked for.
  useEffect(() => () => audio.current?.pause(), []);

  function play(url: string) {
    setNote(null);
    audio.current?.pause();
    const element = new Audio(url);
    audio.current = element;
    // Audio is streamed, so with no signal it simply cannot start. Said once, calmly.
    element.play().catch(() => setNote(t("audio_unavailable")));
  }

  const first = groups[0];
  if (!first) return null;

  const languageName = (code: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  const shown = showing ? showText(showing) : null;

  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue={first.context}>
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList variant="line" aria-label={t("contexts_label")}>
            {groups.map((group) => (
              <TabsTrigger
                key={group.context}
                value={group.context}
                className="min-h-11 px-3 text-body-sm"
              >
                {t(`context_${group.context}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {groups.map((group) => (
          <TabsContent key={group.context} value={group.context} className="pt-3">
            <ul className="flex flex-col gap-3">
              {group.phrases.map((phrase) => (
                <li
                  key={phrase.id}
                  className="flex flex-col gap-3 rounded-card border border-border bg-bg-surface p-4"
                >
                  {phrase.say.map((line) => (
                    <div key={line.locale} className="flex flex-col gap-0.5">
                      <p className="text-caption font-medium text-text-secondary">
                        {t("say_in", { language: languageName(line.locale) })}
                      </p>
                      <p className="text-h3" lang={line.locale}>
                        {line.text}
                      </p>
                      {line.transliteration ? (
                        <p className="text-body-sm text-text-secondary italic">
                          {line.transliteration}
                        </p>
                      ) : null}
                    </div>
                  ))}

                  <div className="flex flex-col gap-0.5">
                    {phrase.say.length > 0 ? (
                      <p className="text-caption font-medium text-text-secondary">{t("means")}</p>
                    ) : null}
                    <p
                      className={phrase.say.length > 0 ? "text-body" : "text-h3"}
                      lang={phrase.meaning.locale}
                    >
                      {phrase.meaning.text}
                    </p>
                    {phrase.meaning.isFallback ? (
                      <p className="text-caption text-text-secondary">{t("not_in_language")}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {phrase.audioUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 gap-1.5"
                        aria-label={t("play_label", { phrase: phrase.meaning.text })}
                        onClick={() => play(phrase.audioUrl!)}
                      >
                        <Volume2 className="size-4" aria-hidden />
                        {t("play")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 gap-1.5"
                      aria-label={t("show_label", { phrase: phrase.meaning.text })}
                      aria-haspopup="dialog"
                      onClick={() => setShowing(phrase)}
                    >
                      <Maximize2 className="size-4" aria-hidden />
                      {t("show")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </TabsContent>
        ))}
      </Tabs>

      {note ? (
        <p role="status" className="text-body-sm text-text-secondary">
          {note}
        </p>
      ) : null}

      {/*
       * "Show to someone": the whole screen, the largest text that fits, nothing else. The
       * person reading it is a stranger glancing at a phone held out to them.
       */}
      <Dialog open={showing !== null} onOpenChange={(open) => !open && setShowing(null)}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-6 bg-bg-surface p-6 text-center sm:max-w-none"
        >
          <DialogTitle className="sr-only">{t("show")}</DialogTitle>
          {shown ? (
            <>
              <p
                className="text-[2.5rem] leading-tight font-semibold break-words"
                lang={shown.locale}
              >
                {shown.text}
              </p>
              {showing?.say[0]?.transliteration ? (
                <p className="text-h3 text-text-secondary italic">
                  {showing.say[0].transliteration}
                </p>
              ) : null}
              {showing && showing.say.length > 0 ? (
                <p className="text-body text-text-secondary" lang={showing.meaning.locale}>
                  {showing.meaning.text}
                </p>
              ) : null}
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-32"
            onClick={() => setShowing(null)}
          >
            {t("show_done")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
