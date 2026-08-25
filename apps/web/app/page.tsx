import {
  HealthPill,
  ItemCard,
  NowCard,
  OfflineBanner,
  SourcesFooter,
  TrustBadge,
} from "@mandhira/ui";

/**
 * Traveler shell (B-001/B-002). Static sample content that exercises the design system;
 * real discovery, planning and live guidance arrive with B-014 onward.
 */
export default function ShellPage() {
  return (
    <div className="min-h-dvh">
      <OfflineBanner message="You're offline — showing your saved plan." />

      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
        <header className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-text-secondary">Mandhira</p>
          <h1 className="text-display">Plan around what matters.</h1>
          <div className="flex flex-wrap items-center gap-2">
            <HealthPill state="comfortable" />
            <TrustBadge state="verified" />
          </div>
        </header>

        <NowCard
          eyebrow="NOW"
          title="Morning darshan"
          detail="Queue is usually shortest before 07:00."
          actions={[]}
        />

        <section aria-label="Day 1" className="flex flex-col">
          <h2 className="mb-3 text-h3">Day 1</h2>
          <ItemCard
            time="06:30"
            title="Morning darshan"
            place="Main temple"
            duration="1 h 30 m"
            tier="PROTECTED"
            travelLeg="25 min by car"
            trailing={<TrustBadge state="verified" />}
          />
          <ItemCard
            time="09:00"
            title="Riverside walk"
            place="Ghat road"
            duration="45 m"
            tier="OPTIONAL"
            trailing={<TrustBadge state="verified_earlier" />}
          />
        </section>

        <SourcesFooter
          sources={[{ name: "Temple administration", tierLabel: "Official temple authority" }]}
          oldestVerified="12 August 2026"
        />
      </main>
    </div>
  );
}
