"use client";

import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { clearGuestDraft, migrateGuestDraft, readGuestDraft } from "../lib/offline/guest-draft";

/**
 * Offering back a journey someone planned before they had an account
 * (PRD-ACCT-001, carried from B-019 via PLAN-02 §5a).
 *
 * A guest can build a whole journey without signing up — that is the point of guest-first —
 * and the brief lives in the URL so it survives a sign-in round trip (D-089/D-093). What
 * the URL does not survive is closing the tab. This is the other half: a draft kept on the
 * device, offered back once there is somewhere to put it.
 *
 * It is OFFERED, never migrated silently. A journey appearing in someone's account because
 * they once looked at a preview is a state change they did not ask for (PRD Principle 6) —
 * and on a shared phone it might not even be their journey.
 */
export function DraftRecovery({ locale }: { locale: string }) {
  const t = useTranslations("draftRecovery");
  const router = useRouter();
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readGuestDraft().then((draft) => {
      if (!cancelled && draft) setFound(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!found) return null;

  async function keep() {
    setBusy(true);
    const result = await migrateGuestDraft();
    setBusy(false);

    if (!result) {
      // Nothing to apologise for and nothing to fix: the draft is still on the device and
      // the offer stays. PRD-OFFL-003 forbids interrupting anyone with a sync failure.
      return;
    }

    setFound(false);
    router.push(`/${locale}/journeys/${result.journeyId}`);
  }

  async function discard() {
    await clearGuestDraft();
    setFound(false);
  }

  return (
    <section
      aria-labelledby="draft-recovery"
      className="flex flex-col gap-3 rounded-card border border-border bg-bg-surface p-4"
    >
      <h2 id="draft-recovery" className="text-h3">
        {t("title")}
      </h2>
      <p className="text-body-sm text-text-secondary">{t("body")}</p>

      <div className="flex gap-2">
        <Button onClick={() => void keep()} disabled={busy}>
          {busy ? t("keeping") : t("keep")}
        </Button>
        <Button variant="secondary" onClick={() => void discard()} disabled={busy}>
          {t("discard")}
        </Button>
      </div>
    </section>
  );
}
