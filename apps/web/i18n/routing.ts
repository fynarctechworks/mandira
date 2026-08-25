import { DEFAULT_LOCALE, LOCALES } from "@mandhira/i18n";
import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

/**
 * Locale-prefixed traveler routes (`/[locale]/…`, FRONTEND_ARCHITECTURE).
 *
 * `localePrefix: "always"` — every URL carries its locale, including English. A shared
 * link then means the same thing to whoever opens it, which matters for a product whose
 * pages get passed between family members planning together.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
