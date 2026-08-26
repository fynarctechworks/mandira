"use client";

import { OfflineBanner } from "@mandhira/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { lastSyncAt } from "../lib/offline/sync";

/**
 * Offline indicator (PRD-OFFL-002).
 *
 * `navigator.onLine` alone is not trustworthy — it reports whether a network interface
 * exists, which on a train or in a temple basement is routinely true while nothing
 * reaches the internet. So this also runs a lightweight heartbeat (TRD §11.2 Day 9) and
 * only claims to be online when something actually answered.
 *
 * The banner states WHEN the saved information is from, because "offline" alone does not
 * tell a traveler whether what they are reading is an hour or a week old.
 *
 * And "when" means when the SNAPSHOT was written, not when the network last answered —
 * those are different numbers and only one of them is the traveler's question (PRD-OFFL-002,
 * B-023). Someone who dropped signal four minutes ago may be reading a snapshot from last
 * Tuesday; telling them "as of 4 minutes ago" would be reassuring and wrong. It falls back
 * to the last-reachable time only when nothing has been stored yet.
 */
export function ConnectionBanner() {
  const t = useTranslations("offline");
  const format = useFormatter();
  const [online, setOnline] = useState(true);
  const [lastReachable, setLastReachable] = useState<Date | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Fails fast rather than hanging on a captive portal that accepts the connection
      // and never replies.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      try {
        await fetch("/api/heartbeat", { cache: "no-store", signal: controller.signal });
        if (cancelled) return;
        setOnline(true);
        setLastReachable(new Date());
      } catch {
        if (!cancelled) setOnline(false);
      } finally {
        clearTimeout(timer);
      }
    }

    const onBrowserOnline = () => void check();
    const onBrowserOffline = () => setOnline(false);

    // A browser "offline" event is conclusive; "online" only means worth re-checking.
    window.addEventListener("online", onBrowserOnline);
    window.addEventListener("offline", onBrowserOffline);

    if (!navigator.onLine) setOnline(false);
    else void check();

    const interval = setInterval(() => void check(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", onBrowserOnline);
      window.removeEventListener("offline", onBrowserOffline);
    };
  }, []);

  // Read once the banner is actually needed, rather than on every render.
  useEffect(() => {
    if (online) return;
    let cancelled = false;

    void lastSyncAt().then((iso) => {
      if (!cancelled && iso) setSavedAt(new Date(iso));
    });

    return () => {
      cancelled = true;
    };
  }, [online]);

  if (online) return null;

  const when = savedAt ?? lastReachable;

  return (
    <OfflineBanner
      message={
        when
          ? t("banner", { when: format.dateTime(when, { timeStyle: "short" }) })
          : t("bannerNoDate")
      }
    />
  );
}
