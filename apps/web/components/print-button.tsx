"use client";

import { Button } from "@mandhira/ui";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Print the summary (PRD-PREP-004).
 *
 * A button rather than only relying on the browser's own print menu: on a phone that menu
 * is two or three taps into a share sheet, and this page's whole purpose is being carried
 * on paper by someone who does not have the app.
 */
export function PrintButton() {
  const t = useTranslations("printButton");

  return (
    <Button variant="secondary" fullWidth onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      {t("action")}
    </Button>
  );
}
