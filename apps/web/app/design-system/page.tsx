import { Actions } from "./_parts/actions";
import { DataDisplay } from "./_parts/data-display";
import { Feedback } from "./_parts/feedback";
import { Forms } from "./_parts/forms";
import { Foundations } from "./_parts/foundations";
import { Navigation } from "./_parts/navigation";
import { Overlays } from "./_parts/overlays";
import { ThemeToggle } from "./_parts/shell";

/**
 * The design-system reference.
 *
 * WHY THIS PAGE EXISTS. Every component in the shadcn preset `b2xb9m6ayu` (style
 * `base-lyra`) is rendered here, in Mandhira's colours, from this repo's own copy of the
 * source. The point is that a redesign no longer needs a round trip to ui.shadcn.com to
 * see what a control looks like — this page IS the reference, and because it imports the
 * same `@mandhira/ui` the apps import, it cannot show anything the apps would not.
 *
 * It is also the regression check for the token layer: if `design-system.css` breaks, it
 * breaks visibly here first, on one page, rather than quietly across 45 routes.
 */

const SECTIONS = [
  ["foundations", "Foundations"],
  ["actions", "Actions"],
  ["forms", "Forms & inputs"],
  ["data", "Data display"],
  ["navigation", "Navigation"],
  ["overlays", "Overlays"],
  ["feedback", "Feedback & content"],
] as const;

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <header className="pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              Mandhira design system
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              The shadcn preset <code className="font-mono text-xs">b2xb9m6ayu</code> — style{" "}
              <code className="font-mono text-xs">base-lyra</code>, base colour{" "}
              <code className="font-mono text-xs">mist</code>, built on Base UI — with the brand
              orange set to <code className="font-mono text-xs">#FF660E</code>. 62 components, all
              of them below.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <nav className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main className="space-y-12 pb-24">
        <Foundations />
        <Actions />
        <Forms />
        <DataDisplay />
        <Navigation />
        <Overlays />
        <Feedback />
      </main>
    </div>
  );
}
