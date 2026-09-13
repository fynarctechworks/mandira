"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { watchJourneyVersion } from "../lib/journey-sync";

/**
 * Keeps an open journey in step with edits made on another device (PRD-ACCT-005).
 *
 * Renders nothing. Checks the journey's version every ten seconds while the tab is visible and
 * online, checks at once when the tab comes back, and refreshes the page when the journey
 * changed elsewhere. The server renders the new plan; nothing is merged on the client.
 */
export function JourneySync({ journeyId, version }: { journeyId: string; version: string }) {
  const router = useRouter();

  useEffect(() => {
    const watcher = watchJourneyVersion({
      initialVersion: version,
      isActive: () => document.visibilityState === "visible" && navigator.onLine,
      fetchVersion: async () => {
        const response = await fetch(`/api/journeys/${journeyId}/version`, { cache: "no-store" });
        if (!response.ok) return null;
        const payload = (await response.json()) as { ok?: boolean; data?: { version?: string } };
        return payload.ok ? (payload.data?.version ?? null) : null;
      },
      onChange: () => router.refresh(),
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void watcher.check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      watcher.stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [journeyId, version, router]);

  return null;
}
