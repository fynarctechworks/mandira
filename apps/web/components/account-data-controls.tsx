"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@mandhira/ui/components/ui/alert-dialog";
import { Button } from "@mandhira/ui/components/ui/button";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Take your data, or leave (PRD-PRIV-003/004, DPDP).
 *
 * Deletion is a request with a 30-day grace period, and the date it takes effect is shown with
 * a way to keep the account for as long as that is still possible.
 */
export function AccountDataControls({
  initialScheduledFor,
  locale,
}: {
  initialScheduledFor: string | null;
  locale: string;
}) {
  const t = useTranslations("accountData");
  const [scheduledFor, setScheduledFor] = useState(initialScheduledFor);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));

  async function download() {
    setExporting(true);
    setProblem(null);

    try {
      const response = await fetch("/api/account/export", { method: "POST" });
      if (!response.ok) throw new Error("export unavailable");

      const blob = await response.blob();
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
        "mandhira-my-data.json";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setProblem(t("export_unavailable"));
    } finally {
      setExporting(false);
    }
  }

  async function erasure(method: "POST" | "DELETE") {
    setPending(true);
    setProblem(null);
    setNote(null);

    const response = await fetch("/api/account/delete", {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ confirm: true }) } : {}),
    }).catch(() => null);

    const payload = response ? await response.json().catch(() => ({ ok: false })) : { ok: false };
    setPending(false);
    setConfirming(false);

    if (!payload.ok) {
      setProblem(t("not_done"));
      return;
    }

    setScheduledFor(payload.data.scheduledFor ?? null);
    if (method === "DELETE") setNote(t("kept"));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          disabled={exporting}
          onClick={() => void download()}
          className="min-h-11 gap-2 self-start text-sm"
        >
          <Download className="size-4" aria-hidden />
          {exporting ? t("exporting") : t("export")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("export_hint")}</p>
      </div>

      {scheduledFor ? (
        <div role="status" className="flex flex-col gap-2 border border-border bg-card p-3">
          <p className="text-sm">{t("scheduled", { date: dateOf(scheduledFor) })}</p>
          <Button
            type="button"
            disabled={pending}
            onClick={() => void erasure("DELETE")}
            className="min-h-11 self-start text-sm"
          >
            {t("keep")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11 self-start text-sm"
                />
              }
            >
              {t("delete")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("delete_title")}</AlertDialogTitle>
                <AlertDialogDescription>{t("delete_body")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11 text-sm">
                  {t("delete_cancel")}
                </AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => void erasure("POST")}
                  className="min-h-11 text-sm"
                >
                  {t("delete")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="text-xs text-muted-foreground">{t("delete_hint")}</p>
        </div>
      )}

      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
