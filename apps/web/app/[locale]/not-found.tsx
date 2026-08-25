import Link from "next/link";

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
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="text-display">This page isn&apos;t here</h1>
      <p className="text-body text-text-secondary">
        The link may have changed, or it may have been a shared journey that is no longer being
        shared.
      </p>

      <Link
        href="/"
        className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-button bg-brand-primary px-4 font-medium text-text-on-primary"
      >
        Go to the home screen
      </Link>
    </main>
  );
}
