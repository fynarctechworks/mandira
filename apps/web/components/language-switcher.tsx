"use client";

import { LOCALE_LABELS, LOCALES, isLocale } from "@mandhira/i18n";
import { cn } from "@mandhira/ui";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import { useLocale, useTranslations } from "next-intl";
import { useId, useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/routing";

/**
 * Language (PRD F12, A01).
 *
 * Switching changes the locale in the URL, so a shared link keeps meaning the same thing. For a
 * signed-in traveler the choice is also saved to their profile, so the next device opens in it.
 * Each language is named in its own script — someone looking for Telugu reads Telugu.
 */
export function LanguageSwitcher({
  saveToProfile,
  compact = false,
}: {
  saveToProfile: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const id = useId();

  async function choose(next: string) {
    if (!isLocale(next) || next === locale) return;

    if (saveToProfile) {
      // The switch happens either way; a preference that did not save is sent again next time.
      await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: next }),
      }).catch(() => undefined);
    }

    startTransition(() => router.replace(`${pathname}${window.location.search}`, { locale: next }));
  }

  return (
    <div className={compact ? "flex items-center" : "flex flex-col gap-1.5"}>
      <label htmlFor={id} className={compact ? "sr-only" : "text-sm font-medium"}>
        {t("label")}
      </label>
      <NativeSelect
        id={id}
        value={locale}
        disabled={pending}
        onChange={(event) => void choose(event.target.value)}
        className={cn(compact ? "w-auto" : "w-full", "[&_select]:h-11 [&_select]:text-sm")}
      >
        {LOCALES.map((code) => (
          <NativeSelectOption key={code} value={code} lang={code}>
            {LOCALE_LABELS[code]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {compact ? null : <p className="text-xs text-muted-foreground">{t("description")}</p>}
    </div>
  );
}
