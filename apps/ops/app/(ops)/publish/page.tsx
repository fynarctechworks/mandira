import Link from "next/link";
import { validationProblems } from "./actions";
import { labelOf } from "@/lib/destinations";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Approve & publish · Mandhira Ops" };

type Candidate = {
  table: string;
  id: string;
  label: string;
  problems: { field: string; message: string }[];
};

/**
 * Approve & publish queue (O13, PRD-OPS-WF-004).
 *
 * Lists everything submitted for review with what is still blocking it, so an approver can
 * see at a glance which items are actually actionable rather than opening each in turn.
 * The problems come from the same SQL function that enforces the gate.
 */
export default async function PublishQueuePage() {
  const supabase = await opsSupabase();

  const [places, experiences, destinations] = await Promise.all([
    supabase
      .from("places")
      .select("id, slug, name_i18n")
      .eq("status", "in_review")
      .is("deleted_at", null),
    supabase
      .from("experiences")
      .select("id, slug, name_i18n")
      .eq("status", "in_review")
      .is("deleted_at", null),
    supabase
      .from("destinations")
      .select("id, slug, name_i18n")
      .eq("status", "in_review")
      .is("deleted_at", null),
  ]);

  const rows: { table: string; id: string; slug: string; name_i18n: unknown }[] = [
    ...(destinations.data ?? []).map((r) => ({ table: "destinations", ...r })),
    ...(places.data ?? []).map((r) => ({ table: "places", ...r })),
    ...(experiences.data ?? []).map((r) => ({ table: "experiences", ...r })),
  ];

  const candidates: Candidate[] = await Promise.all(
    rows.map(async (row) => ({
      table: row.table,
      id: row.id,
      label: labelOf(row.name_i18n, row.slug),
      problems: await validationProblems(row.table, row.id),
    })),
  );

  const ready = candidates.filter((c) => c.problems.length === 0);
  const blocked = candidates.filter((c) => c.problems.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">Approve &amp; publish</h1>
        <p className="mt-1 text-body text-text-secondary">
          Everything waiting for a second pair of eyes. Publishing needs the approver role, and
          cannot be done by whoever made the last change.
        </p>
      </header>

      {candidates.length === 0 ? (
        <p className="text-body text-text-secondary">
          Nothing is waiting for review. Submit a draft from its editor when it&apos;s ready.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="text-h3">Ready to publish ({ready.length})</h2>
            {ready.length === 0 ? (
              <p className="mt-2 text-body-sm text-text-secondary">Nothing is fully ready yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {ready.map((candidate) => (
                  <li
                    key={`${candidate.table}:${candidate.id}`}
                    className="rounded-card border border-border-subtle bg-surface p-3"
                  >
                    <Link
                      href={`/${candidate.table}/${candidate.id}`}
                      className="focus-ring font-medium text-brand-primary-text hover:underline"
                    >
                      {candidate.label}
                    </Link>
                    <span className="ml-2 text-caption text-text-tertiary">
                      {candidate.table.replace(/s$/, "")}
                    </span>
                    <p className="mt-1 text-body-sm text-status-comfortable">● Nothing blocking</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-h3">Still blocked ({blocked.length})</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {blocked.map((candidate) => (
                <li
                  key={`${candidate.table}:${candidate.id}`}
                  className="rounded-card border border-border-subtle bg-surface p-3"
                >
                  <Link
                    href={`/${candidate.table}/${candidate.id}`}
                    className="focus-ring font-medium text-brand-primary-text hover:underline"
                  >
                    {candidate.label}
                  </Link>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {candidate.problems.map((problem) => (
                      <li key={problem.field} className="text-body-sm text-text-secondary">
                        ○ {problem.field}: {problem.message}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
