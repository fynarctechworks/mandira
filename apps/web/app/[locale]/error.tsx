"use client";

import { reportError } from "@mandhira/db/reporting";
import { Alert, AlertDescription, AlertTitle, Button } from "@mandhira/ui";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

/**
 * What a traveler sees when a screen cannot be built (CLAUDE.md §4: every view has an
 * error state).
 *
 * Until this existed, Next's own fallback showed through — *"Application error: a
 * server-side exception has occurred"* plus a digest number. That is three of PRD §12.7's
 * forbidden words in one sentence, addressed to someone who may be standing in a temple
 * queue on a bad signal, and the digest tells them nothing they can act on.
 *
 * So: say what happened in plain words, say what they can do, and keep the journey
 * reachable. No "error", no "failed", no exclamation mark.
 */
export default function TravelerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /*
     * The cause is recorded, never rendered. A stack trace on screen is noise to a
     * traveler and a gift to anyone probing the app. Sentry replaces this in B-024.
     */
    /*
     * Through the same reporter every route failure uses (PLAT-06), so a screen that
     * failed to render and a route that failed to answer land in one place. The cause is
     * recorded, never rendered — a stack trace on screen is noise to a traveler and a gift
     * to anyone probing.
     */
    reportError({ route: `render traveler ${error.digest ?? "unknown"}`, error, app: "web" });
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <Alert>
        <AlertTitle>This screen didn&apos;t load</AlertTitle>
        <AlertDescription>
          Something on our side didn&apos;t answer. Your journey is saved — nothing has been lost.
        </AlertDescription>
      </Alert>

      <Button onClick={reset} fullWidth>
        <RefreshCw className="size-4" aria-hidden />
        Try again
      </Button>
    </main>
  );
}
