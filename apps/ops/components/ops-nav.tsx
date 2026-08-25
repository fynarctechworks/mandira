"use client";

import { cn } from "@mandhira/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, navItemsBySection } from "@/lib/nav";

/**
 * Sidebar navigation over the whole Ops screen map.
 *
 * Screens that are not built yet render as disabled list items carrying the milestone
 * that brings them, rather than being hidden. An operator can see the shape of the
 * platform, and nothing silently appears later without explanation.
 */
export function OpsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Operations sections" className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id}>
          <h2 className="px-3 text-caption font-medium tracking-[0.06em] text-text-tertiary">
            {section.label.toUpperCase()}
          </h2>
          <ul className="mt-1 flex flex-col">
            {navItemsBySection(section.id).map((item) => {
              if (item.href === null) {
                return (
                  <li key={item.id}>
                    <span
                      aria-disabled="true"
                      className="flex min-h-9 items-center justify-between gap-2 rounded-button px-3 text-body-sm text-text-tertiary"
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="shrink-0 rounded-chip bg-surface-raised px-1.5 py-0.5 text-caption">
                        {item.comingIn}
                      </span>
                    </span>
                  </li>
                );
              }

              const active = pathname === item.href;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-ring flex min-h-9 items-center rounded-button px-3 text-body-sm",
                      active
                        ? "bg-brand-primary-soft font-medium text-brand-primary-text"
                        : "text-text-primary hover:bg-surface-raised",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
