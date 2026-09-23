import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadProblem } from "@/components/load-problem";
import { RestoreVersion } from "@/components/restore-version";
import { isVersionedTable, versionDiff } from "@/lib/audit";
import { editorPath, entityNoun, formatWhen, labelOf } from "@/lib/entities";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "History · Mandhira Ops" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O20 — one entity's version history (PRD-OPS-WF-008).
 *
 * Each version compared with the one before it, and a restore behind a confirmation.
 * Readable by any Ops role (0008); restoring needs an editor or admin, checked again in SQL.
 */
export default async function EntityHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string; id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { table, id } = await params;
  const { v } = await searchParams;
  if (!isVersionedTable(table) || !UUID.test(id)) notFound();

  const supabase = await opsSupabase();
  const [roles, versions, team] = await Promise.all([
    getOpsRoles(supabase),
    supabase
      .from("entity_versions")
      .select("version, snapshot, changed_fields, changed_by, change_reason, created_at")
      .eq("entity_table", table)
      .eq("entity_id", id)
      .order("version", { ascending: false })
      .limit(200),
    supabase.rpc("ops_team"),
  ]);

  const list = versions.data ?? [];
  const latest = list[0];
  const emailById = new Map((team.data ?? []).map((member) => [member.user_id, member.email]));
  const snapshot = (latest?.snapshot ?? {}) as Record<string, unknown>;
  const label = labelOf(
    snapshot["name_i18n"] ?? snapshot["title_i18n"],
    typeof snapshot["slug"] === "string" ? snapshot["slug"] : entityNoun(table),
  );

  const selected = list.find((row) => String(row.version) === v) ?? latest;
  const previous = selected ? list.find((row) => row.version === selected.version - 1) : undefined;
  const changes = selected
    ? versionDiff(previous?.snapshot, selected.snapshot, previous ? selected.changed_fields : [])
    : [];
  const editor = editorPath(table, id);
  const canRestore = hasAnyRole(roles, ["editor", "admin"]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-body-sm text-text-secondary">
          <Link href="/audit" className="focus-ring underline">
            Audit log
          </Link>{" "}
          · {entityNoun(table)}
        </p>
        <h1 className="text-h1">History of {label}</h1>
        {editor ? (
          <Link href={editor} className="focus-ring text-body-sm underline">
            Open the editor
          </Link>
        ) : null}
      </header>

      {versions.error ? (
        <LoadProblem />
      ) : list.length === 0 ? (
        <p className="text-body text-text-secondary">
          No versions recorded for this {entityNoun(table).toLowerCase()} yet.
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-labelledby="versions-heading" className="flex flex-col gap-2">
            <h2 id="versions-heading" className="text-h3">
              Versions ({list.length})
            </h2>
            <Table>
              <TableCaption className="sr-only">Every recorded version, newest first</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Changed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((row) => {
                  const current = row.version === selected?.version;
                  return (
                    <TableRow key={row.version} data-state={current ? "selected" : undefined}>
                      <TableCell>
                        {/*
                          The whole path, not a bare "?v=1". A query-only link on the same
                          route was resolved unreliably by the router: the link took focus
                          and the page stayed on the version it was already showing, which
                          an operator would read as the click doing nothing.
                        */}
                        <Link
                          href={`/audit/${table}/${id}?v=${row.version}`}
                          aria-current={current ? "true" : undefined}
                          className="focus-ring font-medium underline"
                        >
                          v{row.version}
                        </Link>
                        {row.version === latest?.version ? (
                          <span className="ml-1 text-caption text-text-secondary">current</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatWhen(row.created_at)}</TableCell>
                      <TableCell>
                        {row.changed_by
                          ? (emailById.get(row.changed_by) ?? "An Ops user")
                          : "The system"}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal text-text-secondary">
                        {row.changed_fields.length > 0 ? row.changed_fields.join(", ") : "Created"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>

          {selected ? (
            <section aria-labelledby="diff-heading" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="diff-heading" className="text-h3">
                    Version {selected.version}
                  </h2>
                  <p className="text-body-sm text-text-secondary">
                    {previous
                      ? `Compared with version ${previous.version}.`
                      : "The first recorded version, shown in full."}
                    {selected.change_reason ? ` Reason: ${selected.change_reason}` : ""}
                  </p>
                </div>
                {canRestore && selected.version !== latest?.version ? (
                  <RestoreVersion
                    entityTable={table}
                    entityId={id}
                    version={selected.version}
                    label={label}
                  />
                ) : null}
              </div>

              {changes.length === 0 ? (
                <p className="text-body-sm text-text-secondary">
                  No field differs from the version before.
                </p>
              ) : (
                <Table>
                  <TableCaption className="sr-only">
                    Each changed field, before and after
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Before</TableHead>
                      <TableHead>After</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changes.map((change) => (
                      <TableRow key={change.field}>
                        <TableCell className="align-top font-mono">{change.field}</TableCell>
                        <TableCell className="align-top">
                          <pre className="max-w-80 whitespace-pre-wrap break-words font-mono text-caption">
                            {change.before}
                          </pre>
                        </TableCell>
                        <TableCell className="align-top">
                          <pre className="max-w-80 whitespace-pre-wrap break-words font-mono text-caption">
                            {change.after}
                          </pre>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {!canRestore ? (
                <p className="text-caption text-text-secondary">
                  Restoring a version needs the editor role.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
