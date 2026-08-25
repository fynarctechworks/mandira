import Link from "next/link";
import { DEFAULT_LOCALE } from "@mandhira/i18n";

import "./globals.css";

/**
 * A URL that matched no route at all (CLAUDE.md §4).
 *
 * This is a SEPARATE file from `[locale]/not-found.tsx` on purpose, and the distinction is
 * easy to get wrong: a segment's not-found only handles `notFound()` called from inside
 * that segment. A URL that matches nothing never enters `[locale]` at all, so it falls
 * through to here — which is why the locale version alone left travelers on Next's bare
 * default page while still returning a correct 404.
 *
 * It emits its own `<html>` and `<body>` because the root layout deliberately does not:
 * the language is only known inside `[locale]`, and this route is what happens when even
 * that is unknown. `lang` falls back to the default locale rather than being omitted —
 * a document with no language is a screen reader guessing.
 */
/*
 * This route emits its own document, so it is also outside the locale layout's metadata —
 * without this it ships with NO `<title>`, which axe flags at WCAG 2.2 AA and which leaves
 * a screen-reader user with a tab announced as the raw URL.
 */
export const metadata = {
  title: "This page isn't here — Mandhira",
  robots: { index: false, follow: false },
};

export default function RootNotFound() {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="antialiased">
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
      </body>
    </html>
  );
}
