"use client";

import type { ChangeCard } from "@mandhira/journey-engine";
import { useEffect, useRef, useState } from "react";

import { ChangeSheet } from "./change-sheet";

/**
 * Noticing that published knowledge moved under this journey (PRD-OPS-WF-007).
 *
 * Runs once after the page has hydrated, not during render. The check writes — it advances
 * `knowledge_checked_at` and records a card — and a GET with side effects would let a
 * prefetch answer somebody's card before they ever opened the screen.
 *
 * The result is a CARD. An operator correcting a temple's evening timing does not move
 * anybody's evening; the traveler is told what changed and offered options, and the plan
 * stays exactly as it was until they pick one (PRD Principle 6, PRD-ADPT-005).
 *
 * Failure is silent, and deliberately so. Not knowing about a change is the state the
 * traveler was already in a second ago; an error banner about a background check they did
 * not ask for is noise on the screen where their plan lives.
 */
export function KnowledgeWatch({ journeyId }: { journeyId: string }) {
  const [event, setEvent] = useState<{ id: string; card: ChangeCard } | null>(null);
  const [pending, setPending] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Once per mount. React 18's development double-invoke would otherwise run the check
    // twice, and the second run would find the mark already advanced and see nothing —
    // harmless here, but it makes the behaviour depend on the environment.
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const response = await fetch(`/api/journeys/${journeyId}/knowledge-check`, {
          method: "POST",
        });
        const payload = await response.json().catch(() => ({ ok: false }));

        if (payload.ok && payload.data?.event?.card?.recommended) {
          setEvent(payload.data.event);
        }
      } catch {
        // Offline, or the request was cut off. Nothing to say.
      }
    })();
  }, [journeyId]);

  async function decide(optionId: string | null) {
    if (!event) return;
    setPending(true);

    try {
      await fetch(`/api/journeys/${journeyId}/changes/${event.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
    } finally {
      setPending(false);
      setEvent(null);
      // The plan on screen was rendered before the decision, so it has to be re-read.
      window.location.reload();
    }
  }

  if (!event) return null;

  return (
    <ChangeSheet
      card={event.card}
      open
      pending={pending}
      onDecide={(optionId) => void decide(optionId)}
      onOpenChange={(next) => {
        // Closing without choosing is not a decision. The card stays unanswered in
        // `journey_change_events` and the plan is untouched.
        if (!next) setEvent(null);
      }}
    />
  );
}
