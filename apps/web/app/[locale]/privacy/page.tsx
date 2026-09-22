import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

import { getLegalNotice } from "../../../lib/legal";

/**
 * What we collect, and who to complain to (PRD-PRIV-005, DPDP §§5 and 13).
 *
 * The text is NOT in this file. A consent notice and a grievance officer are statements
 * the company makes, they change without a release, and a stale one is a compliance
 * failure rather than a typo — so they live in `legal_notices`, which an admin edits in
 * Ops (0054).
 *
 * When nothing is published the page says exactly that. The alternative — shipping
 * plausible placeholder wording — would have a traveler read invented text as the
 * company's actual undertaking, which is worse than an empty section and harder to spot.
 */
export const dynamic = "force-dynamic";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("privacy");
  const [consent, grievance, policy] = await Promise.all([
    getLegalNotice("consent_notice", locale),
    getLegalNotice("grievance_contact", locale),
    getLegalNotice("privacy_policy", locale),
  ]);

  const sections = [
    { key: "consent", heading: t("consent_heading"), body: consent },
    { key: "policy", heading: t("policy_heading"), body: policy },
    { key: "grievance", heading: t("grievance_heading"), body: grievance },
  ];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("intro")}</p>
      </header>

      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-2">
          <h2 className="text-h3">{section.heading}</h2>
          {section.body ? (
            <p className="whitespace-pre-line text-body text-text-primary">{section.body}</p>
          ) : (
            <p className="rounded-card bg-bg-canvas p-3 text-body-sm text-text-secondary">
              {t("not_published")}
            </p>
          )}
        </section>
      ))}

      {/*
        The rights that ARE implemented lead somewhere, so this page is not only words:
        export and deletion both work today (PRD-PRIV-005, ACCT-03).
      */}
      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="text-h3">{t("rights_heading")}</h2>
        <p className="text-body text-text-secondary">{t("rights_body")}</p>
        <Link
          href={`/${locale}/profile`}
          className="focus-ring flex min-h-11 items-center self-start text-body font-medium text-brand-primary-text"
        >
          {t("rights_link")}
        </Link>
      </section>
    </main>
  );
}
