import { DEFAULT_LOCALE, isLocale } from "@mandhira/i18n";
import { getRequestConfig } from "next-intl/server";

/**
 * next-intl request config.
 *
 * English messages are always loaded and merged UNDER the requested locale, so a key that
 * has not been translated yet renders in English rather than as a raw key. A traveler
 * seeing `nav.journey` on screen is strictly worse than seeing "Journey": one is a broken
 * app, the other is an untranslated one (PRD-KNOW-005 applies the same principle to
 * content).
 *
 * te/hi ship as scaffolds until M4 (B-034), so today almost everything falls through.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;

  const english = (await import("../messages/en.json")).default;
  const messages =
    locale === DEFAULT_LOCALE
      ? english
      : mergeDefined(english, (await import(`../messages/${locale}.json`)).default);

  return { locale, messages };
});

/** Overlays `override` onto `base`, ignoring blank values so scaffolds fall through. */
function mergeDefined(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (value && typeof value === "object" && existing && typeof existing === "object") {
      result[key] = mergeDefined(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else if (typeof value === "string" && value.trim() !== "") {
      result[key] = value;
    }
  }

  return result;
}
