"use client";

import { cn } from "@mandhira/ui";
import { useEffect, useState } from "react";

/**
 * Layout furniture for the design-system reference, kept apart from the specimens so the
 * section files stay readable as a catalogue rather than as page code.
 */

export function Section({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border pt-10">
      <h2 className="font-heading text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{summary}</p>
      <div className="mt-6 space-y-8">{children}</div>
    </section>
  );
}

export function Specimen({
  name,
  note,
  className,
  children,
}: {
  name: string;
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-mono text-xs font-medium tracking-tight">{name}</h3>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-5",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Light/dark switch.
 *
 * The preset drives dark mode off a `.dark` class (`@custom-variant dark (&:is(.dark *))`),
 * not `prefers-color-scheme`, so the class has to be put on the element by something. This
 * page toggles it directly rather than pulling in a theme provider: the reference page is
 * the only surface on the new system so far, and wiring app-wide theming is a decision for
 * the migration, not a side effect of building a catalogue.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    // The legacy stylesheet still flips on `prefers-color-scheme` unless `.light` pins it,
    // so pin it here — otherwise an OS set to dark shows half of each theme at once.
    document.documentElement.classList.toggle("light", !dark);
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      aria-pressed={dark}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
    >
      {dark ? "Dark" : "Light"}
    </button>
  );
}
