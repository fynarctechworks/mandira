"use client";

import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@mandhira/ui/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import {
  BadgeCheckIcon,
  BotIcon,
  CircleDashedIcon,
  TriangleAlertIcon,
  UserCheckIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimVerification, completeVerification } from "@/app/(ops)/verify/actions";
import { ageOf, entityNoun } from "@/lib/entities";
import type { VerifyRow } from "@/lib/verify-rows";
import { PublishStatusTag } from "./publish-status-tag";
import { TrustPanel } from "./trust-panel";

const STATUS: Record<string, { label: string; Icon: typeof BadgeCheckIcon }> = {
  unverified: { label: "Not checked", Icon: CircleDashedIcon },
  ai_extracted: { label: "Extracted by AI", Icon: BotIcon },
  human_reviewed: { label: "Reviewed by a person", Icon: UserCheckIcon },
  verified: { label: "Verified", Icon: BadgeCheckIcon },
  disputed: { label: "Disputed", Icon: TriangleAlertIcon },
};

/**
 * O11's rows (PRD F18, PRD-OPS-WF-002).
 *
 * The check itself happens in the field's own trust panel, opened beside the queue, so the
 * verifier records source, evidence and dates through the same action and role table as
 * every editor — the queue adds who is doing it and when it is done, nothing else.
 */
export function VerifyQueue({
  rows,
  sources,
  userId,
}: {
  rows: VerifyRow[];
  sources: { id: string; label: string; tier: string }[];
  userId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function run(
    key: string,
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    done: string,
  ) {
    setMessage(null);
    setProblem(null);
    setBusyKey(key);
    startTransition(async () => {
      const result = await action();
      setBusyKey(null);
      if (!result.ok) {
        setProblem(result.error?.message ?? "That didn't save. Please try again.");
        return;
      }
      setMessage(done);
      router.refresh();
    });
  }

  function claim(row: VerifyRow) {
    run(
      row.key,
      () =>
        row.task
          ? claimVerification({ task_id: row.task.id })
          : claimVerification({
              entity_table: row.entityTable,
              entity_id: row.entityId,
              field_name: row.fieldName,
            }),
      `You are checking ${row.entityLabel} · ${row.fieldLabel}.`,
    );
  }

  function complete(row: VerifyRow) {
    if (!row.task) return;
    const taskId = row.task.id;
    run(row.key, () => completeVerification({ task_id: taskId }), `${row.fieldLabel} is done.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="min-h-5">
        {message ? <p className="text-body-sm text-text-secondary">{message}</p> : null}
        {problem ? (
          <p role="alert" className="text-body-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </div>

      <Table>
        <TableCaption className="sr-only">
          Critical fields waiting to be verified, worst first
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>What</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Trust now</TableHead>
            <TableHead>Against</TableHead>
            <TableHead>Work</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const status = STATUS[row.trust?.verification_status ?? ""];
            const mine = row.task?.assignedTo === userId;
            const claimedByOther = Boolean(row.task?.assignedTo) && !mine;
            const busy = pending && busyKey === row.key;

            return (
              <TableRow key={row.key}>
                <TableCell className="whitespace-normal">
                  {row.editorHref ? (
                    <Link href={row.editorHref} className="focus-ring font-medium underline">
                      {row.entityLabel}
                    </Link>
                  ) : (
                    <span className="font-medium">{row.entityLabel}</span>
                  )}
                  <span className="mt-0.5 flex items-center gap-2 text-caption text-text-secondary">
                    {entityNoun(row.entityTable)} · <PublishStatusTag status={row.entityStatus} />
                  </span>
                </TableCell>

                <TableCell>{row.fieldLabel}</TableCell>

                <TableCell className="whitespace-normal">
                  {status ? (
                    <span className="inline-flex items-center gap-1">
                      <status.Icon aria-hidden="true" className="size-4" />
                      {status.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <CircleDashedIcon aria-hidden="true" className="size-4" />
                      No trust record
                    </span>
                  )}
                  {row.trust ? (
                    <span className="block text-caption text-text-secondary">
                      {row.trust.freshness} · {row.trust.confidence} confidence
                      {row.trust.conflict_flag ? " · sources disagree" : ""}
                      {row.trust.needs_reverification ? " · changed since it was verified" : ""}
                    </span>
                  ) : null}
                </TableCell>

                <TableCell className="text-text-secondary">
                  {row.sourceName
                    ? `${row.sourceName}${row.sourceTier ? ` · ${row.sourceTier}` : ""}`
                    : "No source recorded"}
                </TableCell>

                <TableCell className="whitespace-normal">
                  {row.task ? (
                    <>
                      <Badge variant={mine ? "default" : "outline"}>
                        {mine ? "Yours" : claimedByOther ? "Claimed" : "Unclaimed"}
                      </Badge>
                      <span className="mt-0.5 block max-w-64 text-caption text-text-secondary">
                        Waiting {ageOf(row.task.createdAt)}
                        {row.task.notes ? ` · ${row.task.notes}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-caption text-text-secondary">
                      Not on anyone&apos;s desk
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {!row.task?.assignedTo ? (
                      <Button variant="outline" disabled={busy} onClick={() => claim(row)}>
                        Claim
                      </Button>
                    ) : null}

                    {row.panelField ? (
                      <Sheet onOpenChange={(open) => (open ? undefined : router.refresh())}>
                        <SheetTrigger render={<Button variant="outline" />}>Check</SheetTrigger>
                        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                          <SheetHeader>
                            <SheetTitle>
                              {row.entityLabel} · {row.fieldLabel}
                            </SheetTitle>
                            <SheetDescription>
                              Record what you checked, against which source. Verified needs a
                              verifier and a source; a reviewer can mark it reviewed.
                            </SheetDescription>
                          </SheetHeader>
                          <div className="px-4 pb-4">
                            <TrustPanel
                              entityTable={row.entityTable}
                              entityId={row.entityId}
                              field={row.panelField}
                              sources={sources}
                              record={row.trust ?? undefined}
                            />
                          </div>
                        </SheetContent>
                      </Sheet>
                    ) : null}

                    {row.task && !claimedByOther ? (
                      <Button disabled={busy} onClick={() => complete(row)}>
                        Mark done
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
