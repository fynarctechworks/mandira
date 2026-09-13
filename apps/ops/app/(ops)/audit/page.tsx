import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import { Input } from "@mandhira/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@mandhira/ui/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import { FilePenIcon, FilePlusIcon, FileXIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { LoadProblem, RoleNotice } from "@/components/load-problem";
import {
  AUDIT_ACTIONS,
  AUDIT_PAGE_SIZE,
  AUDITED_TABLES,
  auditQuery,
  changedKeys,
  dayRange,
  isVersionedTable,
  parseAuditFilters,
} from "@/lib/audit";
import { editorPath, entityNoun, formatWhen } from "@/lib/entities";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Audit log · Mandhira Ops" };
export const dynamic = "force-dynamic";

const ACTION = {
  insert: { label: "Created", Icon: FilePlusIcon },
  update: { label: "Changed", Icon: FilePenIcon },
  delete: { label: "Deleted", Icon: FileXIcon },
  publish: { label: "Published", Icon: SendIcon },
} as const;

/**
 * O20 — the audit trail (PRD F18, PRD-OPS-WF-008).
 *
 * Every Ops mutation, written by triggers an operator cannot edit (0029). Readable by admins
 * and approvers only (0008). A GET form, so a filtered trail is a link somebody can send.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const filters = parseAuditFilters(await searchParams);
  const supabase = await opsSupabase();
  const roles = await getOpsRoles(supabase);

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-h1">Audit log</h1>
      <p className="text-body text-text-secondary">
        Who changed what, and when. Written by the database on every Ops change; nobody can edit it,
        including admins. Open an entity&apos;s history to compare or restore its versions.
      </p>
    </header>
  );

  if (!hasAnyRole(roles, ["admin", "approver"])) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <RoleNotice>The audit trail is readable by admins and approvers.</RoleNotice>
      </div>
    );
  }

  const start = (filters.page - 1) * AUDIT_PAGE_SIZE;
  const range = dayRange(filters);

  let query = supabase
    .from("audit_log")
    .select("id, actor_user_id, action, entity_table, entity_id, before, after, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(start, start + AUDIT_PAGE_SIZE - 1);
  if (filters.table) query = query.eq("entity_table", filters.table);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.actor) query = query.eq("actor_user_id", filters.actor);
  if (range.gte) query = query.gte("created_at", range.gte);
  if (range.lt) query = query.lt("created_at", range.lt);

  const [{ data, error, count }, team] = await Promise.all([
    query,
    hasAnyRole(roles, ["admin"]) ? supabase.rpc("ops_team") : Promise.resolve({ data: null }),
  ]);

  const emailById = new Map((team.data ?? []).map((member) => [member.user_id, member.email]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / AUDIT_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      {header}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <Filter label="Entity" id="audit-table">
          <NativeSelect id="audit-table" name="table" defaultValue={filters.table ?? ""}>
            <NativeSelectOption value="">Everything</NativeSelectOption>
            {AUDITED_TABLES.map((table) => (
              <NativeSelectOption key={table} value={table}>
                {entityNoun(table)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Filter>
        <Filter label="Action" id="audit-action">
          <NativeSelect id="audit-action" name="action" defaultValue={filters.action ?? ""}>
            <NativeSelectOption value="">Any</NativeSelectOption>
            {AUDIT_ACTIONS.map((action) => (
              <NativeSelectOption key={action} value={action}>
                {ACTION[action].label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Filter>
        {emailById.size > 0 ? (
          <Filter label="Who" id="audit-actor">
            <NativeSelect id="audit-actor" name="actor" defaultValue={filters.actor ?? ""}>
              <NativeSelectOption value="">Anyone</NativeSelectOption>
              {[...emailById.entries()].map(([id, email]) => (
                <NativeSelectOption key={id} value={id}>
                  {email}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Filter>
        ) : null}
        <Filter label="From" id="audit-from">
          <Input id="audit-from" type="date" name="from" defaultValue={filters.from ?? ""} />
        </Filter>
        <Filter label="To" id="audit-to">
          <Input id="audit-to" type="date" name="to" defaultValue={filters.to ?? ""} />
        </Filter>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        <Link href="/audit" className="focus-ring min-h-8 content-center text-body-sm underline">
          Clear
        </Link>
      </form>

      {error ? (
        <LoadProblem />
      ) : (data ?? []).length === 0 ? (
        <p className="text-body text-text-secondary">
          {filters.page > 1 ? "There is no page this far back." : "Nothing recorded matches that."}
        </p>
      ) : (
        <>
          <Table>
            <TableCaption>
              {count ?? 0} {count === 1 ? "entry" : "entries"} · page {filters.page} of {pages}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Fields</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((entry) => {
                const action = ACTION[entry.action as keyof typeof ACTION];
                const table = entry.entity_table ?? "";
                const href =
                  entry.entity_id && isVersionedTable(table)
                    ? `/audit/${table}/${entry.entity_id}`
                    : editorPath(table, entry.entity_id);
                const fields = changedKeys(entry.before, entry.after);

                return (
                  <TableRow key={entry.id}>
                    <TableCell>{formatWhen(entry.created_at)}</TableCell>
                    <TableCell>
                      {entry.actor_user_id
                        ? (emailById.get(entry.actor_user_id) ?? "An Ops user")
                        : "The system"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {action ? <action.Icon aria-hidden="true" /> : null}
                        {action?.label ?? entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {href ? (
                        <Link href={href} className="focus-ring underline">
                          {entityNoun(table)}
                        </Link>
                      ) : (
                        entityNoun(table)
                      )}
                      {entry.entity_id ? (
                        <span className="ml-1 font-mono text-caption text-text-tertiary">
                          {entry.entity_id.slice(0, 8)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-96 whitespace-normal text-text-secondary">
                      {entry.action === "update"
                        ? fields.length > 0
                          ? fields.slice(0, 6).join(", ") +
                            (fields.length > 6 ? ` +${fields.length - 6}` : "")
                          : "No field changed"
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {pages > 1 ? (
            <Pagination>
              <PaginationContent>
                {filters.page > 1 ? (
                  <PaginationItem>
                    <PaginationPrevious href={`/audit${auditQuery(filters, filters.page - 1)}`} />
                  </PaginationItem>
                ) : null}
                {filters.page < pages ? (
                  <PaginationItem>
                    <PaginationNext href={`/audit${auditQuery(filters, filters.page + 1)}`} />
                  </PaginationItem>
                ) : null}
              </PaginationContent>
            </Pagination>
          ) : null}
        </>
      )}
    </div>
  );
}

function Filter({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
