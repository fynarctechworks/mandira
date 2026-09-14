"use client";

import { LOCALE_LABELS, LOCALES, isLocale } from "@mandhira/i18n";
import { Button, cn } from "@mandhira/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/routing";

const CHOSEN_KEY = "mandhira:language-chosen";

/**
 * Welcome & language (PRD A01), once per device.
 *
 * Three tiles, each language named in its own script, and one sentence of what Mandhira is
 * for. Choosing a tile switches the whole app to it; Continue keeps the language the
 * browser already asked for. Either way it is not asked again on this device.
 *
 * Remembered in localStorage, not a cookie or an account: it is a device convenience, and
 * the language itself lives in the URL (and the profile, once signed in). Rendered only
 * after mount, so the server and the first client render agree, and it never appears when
 * storage is unavailable rather than appearing on every visit.
 */
export function FirstRunLanguage() {
  const t = useTranslations("firstRun");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(CHOSEN_KEY)) setShow(true);
    } catch {
      // Storage blocked: better never to ask than to ask on every visit.
    }
  }, []);

  function remember() {
    try {
      window.localStorage.setItem(CHOSEN_KEY, "1");
    } catch {
      // Nothing to do: the card simply closes for this visit.
    }
    setShow(false);
  }

  function choose(next: string) {
    remember();
    if (!isLocale(next) || next === locale) return;
    startTransition(() => router.replace(pathname, { locale: next }));
  }

  if (!show) return null;

  return (
    <section
      aria-labelledby="first-run-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4"
    >
      <h2 id="first-run-title" className="text-h3">
        {t("title")}
      </h2>
      <p className="text-body-sm text-text-secondary">{t("promise")}</p>
      <div role="group" aria-labelledby="first-run-title" className="grid grid-cols-3 gap-2">
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={code === locale}
            disabled={pending}
            onClick={() => choose(code)}
            className={cn(
              "focus-ring flex min-h-14 items-center justify-center rounded-lg border px-2 text-body font-medium",
              code === locale
                ? "border-brand-primary bg-brand-primary-soft text-brand-primary-text"
                : "border-border",
            )}
          >
            {LOCALE_LABELS[code]}
          </button>
        ))}
      </div>
      <Button onClick={remember} disabled={pending} fullWidth>
        {t("continue")}
      </Button>
    </section>
  );
}
