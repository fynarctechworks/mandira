"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { saveGuestDraft } from "../lib/offline/guest-draft";

type Brief = {
  destinationId: string;
  startDate: string;
  dayCount: number;
  pace?: string;
  mustDo: string[];
  wouldLike: string[];
  fixedCommitments: { at: string }[];
  travelers: { mobility: string; ageBand: string }[];
};

/**
 * "Keep this journey" — the only place the preview becomes a saved thing.
 *
 * A guest is sent to sign-in with `next` pointing back at this exact brief, so signing in
 * returns them to the plan they were saving rather than to an empty home screen. The brief
 * lives in the URL (D-089/D-093), which is what makes that possible without a server-side
 * guest draft.
 */
export function SaveJourney({ brief, locale }: { brief: Brief; locale: string }) {
  const t = useTranslations("saveJourney");
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  /*
   * Keep the brief on the device as soon as a preview is looked at.
   *
   * The URL already carries it through a sign-in round trip (D-089/D-093); what the URL
   * does not survive is closing the tab. This is what lets someone plan on the bus, shut
   * the phone, and still be offered their journey when they come back and sign in.
   */
  useEffect(() => {
    void saveGuestDraft(brief as unknown as Record<string, unknown>);
  }, [brief]);

  async function save() {
    setStatus("saving");
    setProblem(null);

    const response = await fetch("/api/journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(brief),
    });

    const payload = await response.json();

    if (response.status === 401) {
      // Not an error — an account is asked for at the first moment it buys the traveler
      // something, and `next` carries the whole brief back.
      const back = `${window.location.pathname}${window.location.search}`;
      router.push(`/${locale}/sign-in?next=${encodeURIComponent(back)}`);
      return;
    }

    if (!payload.ok) {
      setProblem(payload.error?.message ?? t("not_saved"));
      setStatus("idle");
      return;
    }

    router.push(`/${locale}/journeys/${payload.data.journeyId}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => void save()} disabled={status === "saving"} fullWidth>
        {status === "saving" ? t("keeping") : t("keep")}
      </Button>
      {problem ? (
        <p role="alert" className="text-body-sm text-status-broken">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
