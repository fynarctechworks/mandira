"use client";

import { Button } from "@mandhira/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Asking for push permission, at the right moment (NOTF-01).
 *
 * Deliberately NOT on first visit. A browser permission prompt shown before anyone knows
 * what the app is gets denied, and a denied prompt is close to permanent — most browsers
 * will not ask again. So this lives on the notifications screen, where the traveler has
 * come specifically to decide what they hear about.
 *
 * Everything degrades. No service worker, no push support, permission denied: the switches
 * below still work, and in-app notifications still arrive. Push is the delivery mechanism,
 * not the feature.
 */
type State = "unsupported" | "denied" | "off" | "on" | "asking";

export function PushToggle() {
  const t = useTranslations("pushToggle");
  const [state, setState] = useState<State>("off");

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setState(existing ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function enable() {
    setState("asking");

    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const key = process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"];
      if (!key) {
        setState("unsupported");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push that is not user-visible is a background
        // channel, and this product has no use for one.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const response = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...subscription.toJSON(),
          userAgent: navigator.userAgent.slice(0, 256),
        }),
      });

      setState((await response.json()).ok ? "on" : "off");
    } catch {
      // Includes the traveler dismissing the prompt. Nothing to report — they said no.
      setState("off");
    }
  }

  async function disable() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setState("off");
        return;
      }

      await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      await subscription.unsubscribe();
      setState("off");
    } catch {
      setState("off");
    }
  }

  if (state === "unsupported") {
    return <p className="text-body-sm text-text-secondary">{t("unsupported")}</p>;
  }

  if (state === "denied") {
    return <p className="text-body-sm text-text-secondary">{t("denied")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        fullWidth
        disabled={state === "asking"}
        onClick={() => void (state === "on" ? disable() : enable())}
      >
        {state === "on" ? t("stop") : state === "asking" ? t("asking") : t("start")}
      </Button>

      {state === "on" ? null : <p className="text-caption text-text-secondary">{t("hint")}</p>}
    </div>
  );
}

/**
 * VAPID keys are base64url; `applicationServerKey` wants raw bytes.
 *
 * A conversion that looks trivial and is the usual reason push "silently does nothing":
 * the subscription is created against a malformed key and every send is rejected by the
 * push service, with no error anywhere the traveler or the app can see.
 */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  /*
   * Returned as its own ArrayBuffer rather than the view. `PushSubscriptionOptionsInit`
   * wants a `BufferSource`, and TypeScript's newer lib types no longer accept a
   * `Uint8Array<ArrayBufferLike>` for it — a view over a SharedArrayBuffer would not be
   * valid here, and the compiler cannot tell the difference.
   */
  return bytes.buffer as ArrayBuffer;
}
