const swatches = [
  { label: "Comfortable", className: "bg-status-comfortable" },
  { label: "Tight", className: "bg-status-tight" },
  { label: "At risk", className: "bg-status-at-risk" },
  { label: "Broken", className: "bg-status-broken" },
  { label: "Info", className: "bg-status-info" },
];

export default function ShellPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-text-secondary">Mandhira</p>
        <h1 className="text-display">Plan around what matters.</h1>
        <p className="text-body text-text-secondary">
          The traveler app shell. Discovery, planning and live guidance arrive with the next backlog
          items.
        </p>
      </header>

      <section
        aria-label="Design tokens"
        className="rounded-card border border-border-subtle bg-surface p-4 shadow-card"
      >
        <h2 className="text-h3">Tokens</h2>
        <ul className="mt-3 flex flex-wrap gap-3">
          {swatches.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-body-sm">
              <span aria-hidden="true" className={`size-4 rounded-chip ${s.className}`} />
              {s.label}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-body-sm text-text-secondary">
          <span lang="te">మందిర</span> · <span lang="hi">मंदिर</span> · Fraunces &amp; Inter
        </p>
      </section>
    </main>
  );
}
