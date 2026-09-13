"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * "Start today" (PRD-LIVE-001).
 *
 * The explicit half of activation. Live Journey is readable whenever the journey's dates
 * say the traveler is on it — nothing has to be written for the screen to work — so this
 * is not a gate. What it does is move the journey to `active`, which is a real state other
 * things read: notifications, the journeys list, and later the Change Card triggers.
 *
 * An explicit tap rather than a clock, because a journey that silently became `active`
 * because a phone woke at 6am is a state change nobody asked for (PRD Principle 6).
 */
export function StartToday({ journeyId }: { journeyId: string }) {
  const t = useTranslations("startToday");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setProblem(null);

    const response = await fetch(`/api/journeys/${journeyId}/live`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });

    const payload = await response.json().catch(() => ({ ok: false }));
    if (!payload.ok) {
      setProblem(t("not_started"));
      setPending(false);
      return;
    }

    router.refresh();
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => void start()} disabled={pending} fullWidth>
        {pending ? t("starting") : t("action")}
      </Button>
      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
