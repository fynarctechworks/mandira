"use client";

import { BottomSheet, Button } from "@mandhira/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { prepareReportPhoto, type PreparedReportPhoto } from "../lib/report-photo";

/**
 * "Report a change" (PRD F14, PRD-REPT-001).
 *
 * The other half of the trust model. Every critical fact carries a badge saying how sure
 * we are; this is what a traveler does when the badge is confident and the world disagrees.
 * Somebody standing at a gate that says CLOSED knows something no source has told us yet.
 *
 * Signed in only, following the schema rather than the ideal: `user_reports` permits an
 * INSERT from `authenticated` alone. Guest reporting is what this wanted — the person who
 * notices is the person who is there — and the disagreement between that and the table's
 * own nullable `user_id` is raised as OPEN-013.
 *
 * What it promises is exactly what happens: a human looks, and nothing is published until
 * they have. No copy here implies the app has been corrected.
 */
const TYPES = [
  { value: "timing_changed", label: "The times are different" },
  { value: "closed", label: "It's closed" },
  { value: "accessibility_issue", label: "Getting in is harder than described" },
  { value: "wrong_information", label: "Something here is wrong" },
  { value: "outdated_guidance", label: "The advice is out of date" },
  { value: "other", label: "Something else" },
] as const;

export function ReportAChange({
  entityTable,
  entityId,
  entityName,
  fieldName,
  locale,
}: {
  entityTable: "places" | "experiences" | "routes" | "destinations";
  entityId: string;
  entityName: string;
  fieldName?: string;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("timing_changed");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "problem">("idle");

  /*
   * One optional photo (PRD F14, D-016). It is redrawn through a canvas on the device
   * before anything leaves it, which removes EXIF — including where it was taken — and
   * shrinks it for a 4G connection (lib/report-photo). The server checks it again.
   */
  const t = useTranslations("reportPhoto");
  const [photo, setPhoto] = useState<PreparedReportPhoto | null>(null);
  const [photoState, setPhotoState] = useState<"none" | "preparing" | "ready" | "unusable">("none");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [photoAttached, setPhotoAttached] = useState(true);

  // The preview is an object URL: released when it is replaced, and when the sheet goes.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function clearPhoto(next: "none" | "unusable") {
    setPhoto(null);
    setPreviewUrl(null);
    setPhotoState(next);
    // A fresh input, so choosing the same file again still counts as a change.
    setPhotoInputKey((key) => key + 1);
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) {
      clearPhoto("none");
      return;
    }

    setPhotoState("preparing");
    const prepared = await prepareReportPhoto(file);
    if (!prepared) {
      clearPhoto("unusable");
      return;
    }

    setPhoto(prepared);
    setPreviewUrl(URL.createObjectURL(prepared.blob));
    setPhotoState("ready");
  }

  async function send() {
    setState("sending");

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportType: type,
        entityTable,
        entityId,
        locale,
        ...(fieldName ? { fieldName } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(photo ? { photo: photo.base64 } : {}),
        /*
         * No journeyId. PRD F14 attaches journey context WITH CONSENT, and nobody has been
         * asked here — so it is left off rather than quietly included because it would be
         * useful to us.
         */
      }),
    });

    const payload = await response.json().catch(() => ({ ok: false }));

    if (payload.ok) {
      setPhotoAttached(!photo || payload.data?.photoAttached === true);
      setState("sent");
    } else if (payload.error?.fieldErrors?.photo) {
      // Only the photo was refused; nothing was filed, and the rest of the form is kept.
      clearPhoto("unusable");
      setState("idle");
    } else {
      setState("problem");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring min-h-11 self-start px-2 text-body-sm font-medium text-brand-primary-text"
      >
        Report a change
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title={`Report a change — ${entityName}`}>
        {state === "sent" ? (
          <div className="flex flex-col gap-3">
            {/* PRD F14's exact promise. Not "fixed", not "updated" — verified. */}
            <p className="text-body">Thanks — our team will verify this.</p>
            {photoAttached ? null : (
              <p className="text-body-sm text-text-secondary">{t("notAttached")}</p>
            )}
            <p className="text-body-sm text-text-secondary">
              Nothing changes on the page until someone has checked it against a source. If enough
              people report the same thing, we&apos;ll mark it as worth checking locally in the
              meantime.
            </p>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-sm font-medium">What did you notice?</legend>

              {TYPES.map((option) => (
                <label key={option.value} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    name="report-type"
                    value={option.value}
                    checked={type === option.value}
                    onChange={() => setType(option.value)}
                    className="focus-ring size-5"
                  />
                  <span className="text-body">{option.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="flex flex-col gap-1">
              <label htmlFor="report-description" className="text-body-sm font-medium">
                Anything else worth knowing? (optional)
              </label>
              <textarea
                id="report-description"
                value={description}
                maxLength={500}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
                className="focus-ring rounded-lg border border-border bg-bg-surface p-3 text-body-sm"
              />
              <p className="text-caption text-text-secondary">
                {500 - description.length} characters left.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {photo && previewUrl ? (
                <>
                  <p className="text-body-sm font-medium">{t("label")}</p>
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image cannot optimise it */}
                    <img
                      src={previewUrl}
                      alt={t("previewAlt")}
                      className="size-20 rounded-lg border border-border object-cover"
                    />
                    <Button variant="secondary" onClick={() => clearPhoto("none")}>
                      {t("remove")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="report-photo" className="text-body-sm font-medium">
                    {t("label")}
                  </label>
                  <input
                    key={photoInputKey}
                    id="report-photo"
                    type="file"
                    accept="image/*"
                    aria-describedby="report-photo-hint"
                    disabled={photoState === "preparing"}
                    onChange={(event) => void pickPhoto(event.target.files?.[0])}
                    className="focus-ring min-h-11 rounded-lg border border-border bg-bg-surface p-2 text-body-sm"
                  />
                </>
              )}
              <p id="report-photo-hint" className="text-caption text-text-secondary">
                {t("hint")} {t("visibility")}
              </p>
              {photoState === "preparing" ? (
                <p role="status" className="text-caption text-text-secondary">
                  {t("preparing")}
                </p>
              ) : null}
              {photoState === "unusable" ? (
                <p role="alert" className="text-body-sm text-status-tight">
                  {t("unusable")}
                </p>
              ) : null}
            </div>

            {state === "problem" ? (
              <p role="alert" className="text-body-sm text-status-broken">
                That didn&apos;t send. Please try again.
              </p>
            ) : null}

            <Button
              onClick={() => void send()}
              disabled={state === "sending" || photoState === "preparing"}
              fullWidth
            >
              {state === "sending" ? "Sending…" : "Send"}
            </Button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
