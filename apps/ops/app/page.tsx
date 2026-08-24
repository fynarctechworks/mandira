const tiers = [
  { label: "FIXED", fill: "bg-tier-fixed-fill", text: "text-tier-fixed-text" },
  { label: "PROTECTED", fill: "bg-tier-protected-fill", text: "text-tier-protected-text" },
  { label: "IMPORTANT", fill: "bg-tier-important-fill", text: "text-tier-important-text" },
  { label: "OPTIONAL", fill: "bg-tier-optional-fill", text: "text-tier-optional-text" },
];

export default function ShellPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-8 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-text-secondary">Mandhira Ops</p>
        <h1 className="text-h1">Operations shell</h1>
        <p className="text-body text-text-secondary">
          Queues, editors, sources and dashboards arrive with the next backlog items.
        </p>
      </header>

      <section
        aria-label="Priority tier chips"
        className="rounded-card border border-border-subtle bg-surface p-6 shadow-card"
      >
        <h2 className="text-h3">Tier chips</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {tiers.map((t) => (
            <li
              key={t.label}
              className={`rounded-chip px-3 py-1 text-caption font-medium tracking-[0.06em] ${t.fill} ${t.text}`}
            >
              {t.label}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
