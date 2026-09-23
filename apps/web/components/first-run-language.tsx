"use client";

import { LOCALE_LABELS, LOCALES, isLocale } from "@mandhira/i18n";
import { Button, cn } from "@mandhira/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/routing";

import { LANGUAGE_CHOSEN_COOKIE } from "../lib/first-run";

// A year, like any other device preference; nothing in it identifies anyone.
const CHOSEN = `${LANGUAGE_CHOSEN_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
/** Where devices that chose before the cookie existed remembered it. */
const LEGACY_KEY = "mandhira:language-chosen";

/**
 * Welcome & language (PRD A01), once per device.
 *
 * Three tiles, each language named in its own script, and one sentence of what Mandhira is
 * for. Choosing a tile switches the whole app to it; Continue keeps the language the
 * browser already asked for. Either way it is not asked again on this device.
 *
 * Remembered in a first-party cookie, not an account: it is a device convenience, and the
 * language itself lives in the URL (and the profile, once signed in). A cookie rather than
 * localStorage because the server has to know: drawn only after scripts ran, the card
 * appeared at the top of Home 4.5 s into Lighthouse's reference-device load and pushed the
 * whole page down (layout shift 0.32; Google counts 0.1 as good), which held Lighthouse to 60
 * against TRD §9's 80 (D-233). Now the server decides, and the card is in the first paint or
 * not there at all.
 */
export function FirstRunLanguage({ chosen }: { chosen: boolean }) {
  const t = useTranslations("firstRun");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(!chosen);
  const [pending, startTransition] = useTransition();

  /*
   * A device that chose before the cookie existed: carry the choice over once, so nobody is
   * asked a second time. Also covers a Home page served from the offline cache after the
   * choice was made — the cached HTML still has the card, and the cookie says otherwise.
   */
  useEffect(() => {
    if (chosen) return;
    let legacy = false;
    try {
      legacy = window.localStorage.getItem(LEGACY_KEY) !== null;
    } catch {
      // Storage blocked: the cookie is the record from here on.
    }
    if (legacy || document.cookie.split("; ").includes(`${LANGUAGE_CHOSEN_COOKIE}=1`)) {
      document.cookie = CHOSEN;
      setShow(false);
    }
  }, [chosen]);

  function remember() {
    document.cookie = CHOSEN;
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
            data-endonym
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
