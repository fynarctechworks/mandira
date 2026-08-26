"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { opsAction } from "@/lib/action";
import { runIngestionForSource } from "@/lib/ingestion";

/**
 * "Run now" (PRD F17, PRD-OPS-SRC-002).
 *
 * PRD F18 gives `researcher` the job of running ingestion, so that is the floor. The runner
 * itself works under the service role — a capture is written on behalf of the system, and
 * `captures` deliberately has no insert policy for `authenticated` — so THIS check is the
 * authorization, not a convenience. It is why the action exists rather than the page
 * calling the runner directly.
 */
export const runIngestion = opsAction({
  roles: ["admin", "editor", "researcher"],
  input: z.object({ sourceId: z.string().uuid() }),
  handler: async ({ input, userId }) => {
    const outcome = await runIngestionForSource(input.sourceId, "manual", userId);

    revalidatePath("/ingestion");
    // A run that opened a candidate has changed what the Review queue holds.
    if (outcome.candidatesOpened > 0) revalidatePath("/review");

    return outcome;
  },
});
