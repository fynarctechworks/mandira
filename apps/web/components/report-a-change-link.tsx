"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { ReportAChange as ReportAChangeForm } from "./report-a-change";

/*
 * The form loads on the first tap, not with the page (see `phrase-shortcut.tsx` for the same
 * pattern). Its drawer and photo handling were a large part of what put Live over
 * TRD-PERF-001's first-load budget. The service worker precaches every chunk, so a report
 * from a gate with no signal still opens.
 */
const ReportAChange = dynamic(
  () => import("./report-a-change").then((module) => module.ReportAChange),
  { ssr: false },
);

/**
 * "Report a change" as a link that opens the form (PRD F14) — the same button the form draws
 * for itself, for a screen that cannot afford to load the form before it is wanted.
 */
export function ReportAChangeLink(
  props: Omit<Parameters<typeof ReportAChangeForm>[0], "open" | "onOpenChange" | "showTrigger">,
) {
  const tReport = useTranslations("reportChange");
  const [open, setOpen] = useState(false);
  // Mounted once first opened and then kept, so closing still animates.
  const [used, setUsed] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUsed(true);
          setOpen(true);
        }}
        className="focus-ring min-h-11 self-start px-2 text-body-sm font-medium text-brand-primary-text"
      >
        {tReport("open")}
      </button>
      {used ? (
        <ReportAChange {...props} open={open} onOpenChange={setOpen} showTrigger={false} />
      ) : null}
    </>
  );
}
