"use client";

import { Button } from "@mandhira/ui";
import { Download, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { offlineFootprint, syncJourneyOffline } from "../lib/offline/sync";
import { useOnline } from "../lib/offline/use-online";

/**
 * Prepare's Downloads section (PRD F11: "shows size, last updated, and 'Update now'").
 *
 * What was here before was a single checkbox, "Save your journey for offline" — a task to
 * tick, which told the traveler nothing about whether the thing had actually happened, how
 * old the saved copy was, or how much of their phone it used. The night before a
 * pilgrimage, "is my journey really on this phone, and is it the latest?" is the question,
 * and a checkbox the traveler ticked themselves cannot answer it.
 *
 * Reads the device's own store rather than asking the server, because the answer is about
 * THIS phone. Offline, "Update now" is disabled and says why rather than failing on tap.
 */
export function OfflineDownloads({ journeyId, locale }: { journeyId: string; locale: string }) {
  const t = useTranslations("offlineDownloads");
  const online = useOnline();
  const [footprint, setFootprint] = useState<{ bytes: number; syncedAt: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setFootprint(await offlineFootprint(journeyId));
    setLoaded(true);
  }, [journeyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function updateNow() {
    setUpdating(true);
    setNote(null);
    const result = await syncJourneyOffline(journeyId, locale);
    await refresh();
    setUpdating(false);
    setNote(result.ok ? t("updated") : t("not_updated"));
  }

  return (
    <section
      aria-labelledby="offline-downloads-heading"
      className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <Download className="size-5 text-text-secondary" aria-hidden />
        <h2 id="offline-downloads-heading" className="text-h3">
          {t("title")}
        </h2>
      </div>

      {!loaded ? (
        <p className="text-body-sm text-text-secondary" role="status">
          {t("checking")}
        </p>
      ) : footprint ? (
        <dl className="grid grid-cols-2 gap-2 text-body-sm">
          <div>
            <dt className="text-text-secondary">{t("size")}</dt>
            <dd className="font-medium tabular-nums">{formatBytes(footprint.bytes)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">{t("last_updated")}</dt>
            <dd className="font-medium">
              <time dateTime={footprint.syncedAt}>
                {new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(footprint.syncedAt))}
              </time>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-body-sm text-text-secondary">{t("not_saved")}</p>
      )}

      <Button
        type="button"
        variant="secondary"
        disabled={!online || updating}
        onClick={() => void updateNow()}
      >
        <RefreshCw className="size-4" aria-hidden />
        {updating ? t("updating") : footprint ? t("update_now") : t("save_now")}
      </Button>

      {!online ? <p className="text-caption text-text-secondary">{t("offline_hint")}</p> : null}
      {note ? (
        <p role="status" className="text-caption text-text-secondary">
          {note}
        </p>
      ) : null}
    </section>
  );
}

/** Bytes in the unit a person thinks in. Kilobytes below a megabyte, one decimal above. */
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
