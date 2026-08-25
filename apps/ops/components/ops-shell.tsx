import type { ReactNode } from "react";
import { CommandPalette } from "./command-palette";
import { OpsNav } from "./ops-nav";
import { SignOutButton } from "./sign-out-button";

/**
 * The Ops frame: sidebar, header, content column.
 *
 * A server component — only the palette, nav highlighting and sign-out need to be
 * interactive, and those are leaf client components (FRONTEND_ARCHITECTURE).
 */
export function OpsShell({
  children,
  operatorEmail,
  roles,
}: {
  children: ReactNode;
  operatorEmail: string;
  roles: string[];
}) {
  return (
    <div className="flex min-h-dvh">
      <CommandPalette />

      <aside className="hidden w-64 shrink-0 border-r border-border-subtle bg-surface px-2 py-6 md:block">
        <div className="px-3 pb-6">
          <p className="text-body font-medium">Mandhira Ops</p>
          <p className="text-caption text-text-tertiary">Press ⌘K to jump</p>
        </div>
        <OpsNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle bg-surface px-8 py-3">
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium">{operatorEmail}</p>
            <p className="truncate text-caption text-text-tertiary">
              {roles.length > 0 ? roles.join(" · ") : "No role"}
            </p>
          </div>
          <SignOutButton />
        </header>

        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
