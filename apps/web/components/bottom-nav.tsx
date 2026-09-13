"use client";

import { cn } from "@mandhira/ui";
import { CircleUser, Compass, ListChecks, Route } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";

/**
 * Bottom navigation (TRD §11.2 Day 9): Home / Journey / Prepare / Profile.
 *
 * Four destinations, fixed. PRD Principle 2 keeps the in-journey experience down to three
 * questions, and the same restraint applies here — a growing tab bar is how a focused app
 * turns into a menu.
 *
 * Icon AND label always, never icon alone (PRD §12.8), and each target is at least 44 px.
 */
const ITEMS = [
  { href: "/", key: "home", icon: Compass },
  { href: "/journeys", key: "journey", icon: Route },
  { href: "/prepare", key: "prepare", icon: ListChecks },
  { href: "/profile", key: "profile", icon: CircleUser },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface"
    >
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-caption",
                  active ? "font-medium text-brand-primary-text" : "text-text-secondary",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
