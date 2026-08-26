"use client";

import { reportError } from "@mandhira/db/reporting";
import { Alert, AlertDescription, AlertTitle, Button } from "@mandhira/ui";
import { useEffect } from "react";

/**
 * What an operator sees when a screen cannot be built (CLAUDE.md §4).
 *
 * Deliberately more forthcoming than the traveler's equivalent. PRD §12.7's ban on
 * "error"/"failed" is about not alarming someone mid-pilgrimage; an operator is at a desk,
 * is trying to fix something, and the reference they can quote to whoever reads the logs
 * is genuinely useful to them. So the digest is shown here and hidden there.
 *
 * The message itself is still not a stack trace: what went wrong belongs in the log, not
 * on a screen that may be shared over someone's shoulder.
 */
export default function OpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /*
     * Through the same reporter every route failure uses (PLAT-06), so a screen that
     * failed to render and a route that failed to answer land in one place. The cause is
     * recorded, never rendered — a stack trace on screen is noise to a traveler and a gift
     * to anyone probing.
     */
    reportError({ route: `render ops ${error.digest ?? "unknown"}`, error, app: "ops" });
  }, [error]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <Alert>
        <AlertTitle>This screen didn&apos;t load</AlertTitle>
        <AlertDescription>
          The request didn&apos;t complete. Nothing you were editing has been saved or changed.
          {error.digest ? (
            <>
              {" "}
              Reference <code className="font-mono">{error.digest}</code>.
            </>
          ) : null}
        </AlertDescription>
      </Alert>

      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
