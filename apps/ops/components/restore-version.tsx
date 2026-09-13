"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@mandhira/ui/components/ui/alert-dialog";
import { Button } from "@mandhira/ui/components/ui/button";
import { HistoryIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreEntityVersion } from "@/app/(ops)/audit/actions";

/** "Restore this version", behind a confirmation that says what restoring does. */
export function RestoreVersion({
  entityTable,
  entityId,
  version,
  label,
}: {
  entityTable: string;
  entityId: string;
  version: number;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function restore() {
    setMessage(null);
    setProblem(null);
    startTransition(async () => {
      const result = await restoreEntityVersion({
        entity_table: entityTable,
        entity_id: entityId,
        version,
      });
      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }
      setMessage(
        result.data.returnedToReview
          ? `Version ${version} is restored. It was published, so it is back in review.`
          : `Version ${version} is restored.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>
          <HistoryIcon aria-hidden="true" />
          Restore this version
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore version {version} of {label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              What it says goes back to how it was in this version, as a new change. If it is
              published it returns to review, because nobody has approved it in this form. Its
              identity and status history are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction onClick={restore}>Restore version {version}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div aria-live="polite">
        {message ? <p className="text-body-sm text-text-secondary">{message}</p> : null}
        {problem ? (
          <p role="alert" className="text-body-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </div>
    </div>
  );
}
