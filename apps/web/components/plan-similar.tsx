"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "Plan a similar journey" (PRD-CMPL-003).
 *
 * Copies the travelers, the pace and the TIERS into a new brief — what the traveler said
 * mattered, not what they ended up doing. Someone who missed an experience they had marked
 * must-do still considers it must-do, and rebuilding from what was completed would quietly
 * demote the thing they were most disappointed to miss.
 *
 * It opens the BRIEF FORM, pre-filled, rather than saving anything. A similar journey is
 * a different journey — different dates, possibly different people — and creating one on a
 * single tap would be the auto-applied change PRD Principle 6 forbids. The dates arrive
 * blank for the same reason: they are the one thing a previous journey cannot tell us and
 * the one thing the traveler certainly has a view on.
 */
export function PlanSimilar({ journeyId, locale }: { journeyId: string; locale: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setProblem(null);

    const response = await fetch(`/api/journeys/${journeyId}/similar`);
    const payload = await response.json().catch(() => ({ ok: false }));

    if (!payload.ok || !payload.data.destinationSlug) {
      setProblem("We couldn't set that up just now. Please try again.");
      setPending(false);
      return;
    }

    const brief = payload.data as {
      destinationSlug: string;
      dayCount: number;
      pace: string;
      mustDo: string[];
      wouldLike: string[];
      mobility: string;
    };

    /*
     * The brief goes in the URL, exactly as the original one did (D-089/D-093). That is
     * what makes it reloadable and shareable, and what let B-019's save flow carry a
     * guest's brief through sign-in.
     */
    const query = new URLSearchParams({
      destination: brief.destinationSlug,
      days: String(brief.dayCount),
      pace: brief.pace,
      mobility: brief.mobility,
    });

    for (const id of brief.mustDo) query.append("must", id);
    for (const id of brief.wouldLike) query.append("like", id);

    router.push(`/${locale}/plan?${query.toString()}`);
  }

  return (
    <section className="flex flex-col gap-2">
      <Button variant="secondary" fullWidth onClick={() => void start()} disabled={pending}>
        {pending ? "Setting it up…" : "Plan a similar journey"}
      </Button>
      <p className="text-caption text-text-secondary">
        Opens the same brief with what you said mattered already ticked. You choose the dates.
      </p>
      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
