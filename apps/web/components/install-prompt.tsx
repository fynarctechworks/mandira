"use client";

import { Button } from "@mandhira/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Chrome's install event, which is not in the standard DOM types. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "mandhira.install-dismissed";

/**
 * Install prompt (TRD §11.2 Day 9).
 *
 * Installing matters more here than for most web apps: on iOS, web push and reliable
 * offline storage only work once the app is on the home screen, and offline is a core
 * requirement rather than a nicety (PRD §Offline).
 *
 * It still waits to be invited — the browser only fires this event when it judges the
 * visit meaningful — and a dismissal is remembered, because asking twice is how a prompt
 * becomes an irritation.
 */
export function InstallPrompt() {
  const t = useTranslations("install");
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      // Private browsing can throw on access; a missing preference is not a reason to
      // skip the prompt.
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!event) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Not remembering the dismissal is a small annoyance, not a failure worth surfacing.
    }
    setEvent(null);
  }

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-md rounded-card border border-border-subtle bg-surface-raised p-4 shadow-raised"
    >
      <h2 className="text-h3">{t("title")}</h2>
      <p className="mt-1 text-body-sm text-text-secondary">{t("body")}</p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            setEvent(null);
          }}
        >
          {t("action")}
        </Button>
        <Button type="button" variant="tertiary" onClick={dismiss}>
          {t("dismiss")}
        </Button>
      </div>
    </div>
  );
}
