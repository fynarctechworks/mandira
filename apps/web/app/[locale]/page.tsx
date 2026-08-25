import { HealthPill, ItemCard, NowCard, SourcesFooter, TrustBadge } from "@mandhira/ui";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

/**
 * Traveler home (A02) — shell only.
 *
 * Real discovery, search and the continue-journey card arrive with B-015, which needs
 * published content to show. Until then this renders the design system honestly rather
 * than mocking a feed that does not exist.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("home");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-text-secondary">Mandhira</p>
        <h1 className="text-display">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("intro")}</p>
      </header>

      <NowCard
        eyebrow="NOW"
        title="Morning darshan"
        detail="Queue is usually shortest before 07:00."
      />

      <section aria-label="Day 1" className="flex flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h3">Day 1</h2>
          <HealthPill state="comfortable" />
        </div>
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
        sources={[{ name: "Temple administration", tierLabel: "Official authority" }]}
        oldestVerified="12 August 2026"
      />
    </main>
  );
}
