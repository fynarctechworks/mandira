"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { OpsNav } from "./ops-nav";

/**
 * The Ops navigation below the `md` breakpoint.
 *
 * The sidebar is hidden on narrow screens, and nothing replaced it: an operator checking a
 * report on a phone could reach only the screen they had a link to. This is the same
 * `OpsNav`, behind a menu button, as a panel over the content. It closes when the route
 * changes — a tapped link should land on the screen, not leave the menu covering it — and
 * on Escape.
 */
export function OpsMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="ops-mobile-nav"
        onClick={() => setOpen((value) => !value)}
        className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-button px-2 text-body-sm font-medium"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        <span>{open ? "Close" : "Menu"}</span>
      </button>

      {open ? (
        <div
          id="ops-mobile-nav"
          className="fixed inset-x-0 top-[var(--ops-header-height,3.75rem)] bottom-0 z-40 overflow-y-auto border-t border-border-subtle bg-surface px-2 py-4"
        >
          <OpsNav />
        </div>
      ) : null}
    </div>
  );
}
