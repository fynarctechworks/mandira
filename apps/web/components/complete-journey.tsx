"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The tap that ends a journey (PRD F16, TRD §5 `POST /api/journeys/:id/complete`).
 *
 * PRD Principle 6 governs the end of a journey exactly as it governs every change inside
 * one: nothing here happens because a date passed. The Record has been readable the whole
 * time; what this adds is that its account of what happened stops moving.
 *
 * Deliberately not urgent, and deliberately not framed as finishing something. Somebody
 * whose journey went badly should not meet a celebration on this screen.
 */
export function CompleteJourney({ journeyId }: { journeyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "problem">("idle");

  async function complete() {
    setState("saving");

    const response = await fetch(`/api/journeys/${journeyId}/complete`, { method: "POST" });
    const payload = await response.json().catch(() => ({ ok: false }));

    if (!payload.ok) {
      setState("problem");
      return;
    }

    setState("idle");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-2">
      <Button
        variant="secondary"
        fullWidth
        onClick={() => void complete()}
        disabled={state === "saving"}
      >
        {state === "saving" ? "Saving…" : "Mark this journey complete"}
      </Button>
      <p className="text-caption text-text-secondary">
        Keeps this record as it stands today. You can still add to your reflection afterwards.
      </p>
      {state === "problem" ? (
        <p role="alert" className="text-body-sm text-status-broken">
          That didn&apos;t save. Please try again.
        </p>
      ) : null}
    </section>
  );
}
