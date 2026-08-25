import { NAV_ITEMS, availableNavItems } from "@/lib/nav";

export const metadata = { title: "Home · Mandhira Ops" };

/**
 * Ops home (O01).
 *
 * The knowledge-health dashboard this screen eventually carries (PRD F20) arrives in M4.
 * Until then it says plainly what an operator can and cannot do yet, rather than showing
 * an empty dashboard that implies the data is simply zero.
 */
export default function OpsHomePage() {
  const available = availableNavItems();
  const pending = NAV_ITEMS.filter((item) => item.href === null);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Operations</h1>
        <p className="text-body text-text-secondary">
          The knowledge platform behind Mandhira. Content is drafted here, verified against sources,
          and only reaches travelers once it passes the publish gate.
        </p>
      </header>

      <section
        aria-labelledby="whats-ready"
        className="rounded-card border border-border-subtle bg-surface p-6 shadow-card"
      >
        <h2 id="whats-ready" className="text-h3">
          What&apos;s ready
        </h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          The foundation is in place: schema, permissions and sign-in. Editing screens are being
          built next.
        </p>
        <ul className="mt-3 flex flex-col gap-1">
          {available.map((item) => (
            <li key={item.id} className="text-body-sm">
              {item.label}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="whats-next"
        className="rounded-card border border-border-subtle bg-surface p-6 shadow-card"
      >
        <h2 id="whats-next" className="text-h3">
          Still to come
        </h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          {pending.length} screens are mapped but not built. Each shows the milestone that brings
          it, in the sidebar and the command palette.
        </p>
      </section>
    </div>
  );
}
