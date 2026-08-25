import { HealthPill, TierChip, TrustBadge, type PriorityTier } from "@mandhira/ui";

const TIERS: PriorityTier[] = ["FIXED", "PROTECTED", "IMPORTANT", "OPTIONAL"];

/**
 * Ops shell (B-001/B-002). The real navigation, queues and data tables arrive with B-008;
 * this page exists to prove the shared design system renders in the Ops app too.
 */
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
        aria-label="Priority tiers"
        className="rounded-card border border-border-subtle bg-surface p-6 shadow-card"
      >
        <h2 className="text-h3">Priority tiers</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {TIERS.map((tier) => (
            <li key={tier}>
              <TierChip tier={tier} readOnly />
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label="Journey health and trust"
        className="rounded-card border border-border-subtle bg-surface p-6 shadow-card"
      >
        <h2 className="text-h3">Health &amp; trust</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          <li>
            <HealthPill state="comfortable" />
          </li>
          <li>
            <HealthPill state="tight" />
          </li>
          <li>
            <HealthPill state="at_risk" />
          </li>
          <li>
            <HealthPill state="broken" />
          </li>
        </ul>
        <ul className="mt-3 flex flex-wrap gap-4">
          <li>
            <TrustBadge state="verified" />
          </li>
          <li>
            <TrustBadge state="verified_earlier" />
          </li>
          <li>
            <TrustBadge state="check_locally" />
          </li>
        </ul>
      </section>
    </main>
  );
}
