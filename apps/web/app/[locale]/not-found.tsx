import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * A page that is not there (CLAUDE.md §4).
 *
 * Reached three ways, and deliberately worded to cover all three without guessing between
 * them: a mistyped URL, a journey belonging to someone else, and a share link that has
 * been revoked or has expired. The second and third are why this says "isn't here" rather
 * than "doesn't exist" — confirming that something exists but is not yours is the leak
 * that `notFound()` was chosen over a 403 to avoid.
 *
 * NO next-intl calls here, deliberately. `getLocale()` needs the request config to have
 * run, and in a not-found render it may not have — when it throws, the error boundary
 * catches it and the response becomes a 200 saying "this screen didn't load", which is
 * both the wrong status and the wrong sentence. The link points at `/` and lets the
 * middleware add the locale, which it does for exactly this case.
 */
export default function TravelerNotFound() {
  const t = useTranslations("notFound");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="text-display">{t("title")}</h1>
      <p className="text-body text-text-secondary">{t("body")}</p>

      <Link
        href="/"
        className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-button bg-brand-primary px-4 font-medium text-text-on-primary"
      >
        {t("home")}
      </Link>
    </main>
  );
}
