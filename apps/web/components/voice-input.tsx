"use client";

import { Mic, MicOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/**
 * The mic on the plan screen (PRD §5 A07: "Text box, mic, 'answer questions' link").
 *
 * Describing a journey out loud is how most people would describe it to a friend, and for
 * an older traveler typing Telugu on a phone keyboard it is the difference between using
 * this screen and not. So speaking is offered — as an addition to the text box, never a
 * replacement: what is heard is written INTO the box, where it can be read and corrected
 * before anything is sent. A mis-heard "Suprabhatam" should be fixed by the traveler, not
 * by a model guessing.
 *
 * The browser's own speech recognition, not a dependency. Where a browser has none, the
 * mic is simply not there — a button that cannot work is worse than no button.
 *
 * PRIVACY, stated where it happens (D-227). In Chrome, speech recognition sends the audio
 * to the browser vendor's service to be turned into text. What a traveler says here is
 * often about their family and their health ("Amma can't walk much"), so the line beside
 * the mic says so before they tap it, and nothing is recorded until they do. The browser
 * then asks for microphone permission itself.
 */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;

/** Speech needs the locale, not the language: Telugu is spoken as te-IN here. */
const SPEECH_LOCALE: Record<string, string> = { en: "en-IN", te: "te-IN", hi: "hi-IN" };

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function VoiceInput({
  locale,
  onText,
}: {
  locale: string;
  /** Called with what was heard, to be added to the text box — never sent on its own. */
  onText: (text: string) => void;
}) {
  const t = useTranslations("voiceInput");
  // Decided after mount: the server has no `window`, and rendering a mic there that then
  // vanishes on a browser without speech would be a flash of a control that does nothing.
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(recognitionClass() !== null);
    return () => recognition.current?.stop();
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recognition.current?.stop();
      return;
    }

    const Class = recognitionClass();
    if (!Class) return;

    const heard = new Class();
    heard.lang = SPEECH_LOCALE[locale] ?? "en-IN";
    heard.interimResults = false;
    heard.continuous = false;

    heard.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    heard.onerror = (event) => {
      // "no-speech" and "aborted" are ordinary, not problems worth a sentence.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setProblem(t("not_allowed"));
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setProblem(t("not_heard"));
      }
    };
    heard.onend = () => setListening(false);

    setProblem(null);
    recognition.current = heard;
    heard.start();
    setListening(true);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        className="focus-ring flex min-h-11 items-center gap-2 self-start rounded-lg border border-border px-3 text-body-sm font-medium"
      >
        {listening ? (
          <MicOff className="size-4" aria-hidden />
        ) : (
          <Mic className="size-4" aria-hidden />
        )}
        {listening ? t("stop") : t("speak")}
      </button>
      <p className="text-caption text-text-secondary">{t("privacy")}</p>
      {listening ? (
        <p role="status" className="text-caption text-text-secondary">
          {t("listening")}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-caption text-status-tight">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
