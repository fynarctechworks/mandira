import Link from "next/link";

/**
 * A record that is not there (CLAUDE.md §4).
 *
 * In Ops this is usually a deleted entity or a stale bookmark, and occasionally a record an
 * operator's role cannot reach — RLS returns nothing rather than refusing, so those arrive
 * here too. The wording covers all three without asserting which, because saying "you do
 * not have access to this" confirms the record exists.
 */
export default function OpsNotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-h1">This record isn&apos;t here</h1>
      <p className="text-body text-text-secondary">
        It may have been removed, or the link may be out of date.
      </p>
      <Link href="/" className="text-body font-medium text-brand-primary-text underline">
        Back to the dashboard
      </Link>
    </main>
  );
}
