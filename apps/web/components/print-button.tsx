"use client";

import { Button } from "@mandhira/ui";
import { Printer } from "lucide-react";

/**
 * Print the summary (PRD-PREP-004).
 *
 * A button rather than only relying on the browser's own print menu: on a phone that menu
 * is two or three taps into a share sheet, and this page's whole purpose is being carried
 * on paper by someone who does not have the app.
 */
export function PrintButton() {
  return (
    <Button variant="secondary" fullWidth onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      Print or save as PDF
    </Button>
  );
}
