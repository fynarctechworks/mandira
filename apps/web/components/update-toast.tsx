"use client";

import { Button } from "@mandhira/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * "A new version is ready" (TRD-DEPL-002).
 *
 * The rule this exists to honour is the second half of that requirement: NEVER force a
 * reload. A traveler mid-journey may be standing in a queue relying on what is on screen,
 * and reloading under them could interrupt exactly the moment the app is meant to help
 * with. So a new service worker waits, and the reload happens only when the person taps.
 */
export function UpdateToast() {
  const t = useTranslations("update");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function watch() {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration || cancelled) return;

      // A worker already waiting from a previous visit.
      if (registration.waiting) setWaiting(registration.waiting);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          // "installed" with an existing controller means an update, not a first install.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(installing);
          }
        });
      });
    }

    void watch();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-raised p-3 shadow-raised"
    >
      <p className="text-body-sm">{t("title")}</p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          // Hand over, then reload once the new worker is in control.
          waiting.postMessage({ type: "SKIP_WAITING" });
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => window.location.reload(),
            { once: true },
          );
        }}
      >
        {t("action")}
      </Button>
    </div>
  );
}
