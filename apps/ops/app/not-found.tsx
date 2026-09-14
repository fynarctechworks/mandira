import Link from "next/link";

export const metadata = { title: "Not found · Mandhira Ops" };

/**
 * A URL that matches no Ops screen at all.
 *
 * `(ops)/not-found.tsx` only handles `notFound()` raised inside that group — a record that
 * is not there. A mistyped address never enters the group, so without this file it fell
 * through to Next's bare default page, unstyled and unbranded. This one sits under the root
 * layout, so it keeps the fonts and tokens, and it sends the operator somewhere useful.
 */
export default function OpsRootNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-10 md:px-8">
      <p className="text-caption font-medium tracking-[0.06em] text-text-tertiary">MANDHIRA OPS</p>
      <h1 className="text-h1">There&apos;s no screen at this address</h1>
      <p className="text-body text-text-secondary">
        The link may be mistyped or out of date. Everything in Ops is reachable from the dashboard,
        or press ⌘K there to jump to a screen.
      </p>
      <Link
        href="/"
        className="focus-ring inline-flex min-h-11 items-center justify-center self-start rounded-button bg-brand-primary px-4 text-body font-medium text-text-on-primary"
      >
        Go to the dashboard
      </Link>
    </main>
  );
}
