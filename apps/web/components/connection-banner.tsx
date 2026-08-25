"use client";

import { OfflineBanner } from "@mandhira/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
 */
export function ConnectionBanner() {
  const t = useTranslations("offline");
  const format = useFormatter();
  const [online, setOnline] = useState(true);
  const [lastReachable, setLastReachable] = useState<Date | null>(null);

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

  if (online) return null;

  return (
    <OfflineBanner
      message={
        lastReachable
          ? t("banner", { when: format.dateTime(lastReachable, { timeStyle: "short" }) })
          : t("bannerNoDate")
      }
    />
  );
}
