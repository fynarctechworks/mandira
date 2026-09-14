import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { dateForDay } from "@mandhira/journey-engine";

import { ExperienceDetailBody } from "../../../../../../components/experience-detail-body";
import { listJourneysAt } from "../../../../../../lib/journeys";
import { getExperienceDetail } from "../../../../../../lib/knowledge";
import { formatDate } from "../../../../../../lib/present";
import { webSupabase } from "../../../../../../lib/supabase";

/**
 * Experience detail (PRD F2 / F9). The page itself lives in `ExperienceDetailBody`, shared
 * with the Ops preview (OPS-PREVIEW-01); this route adds what only a traveler has — their
 * journeys to add it to, and reporting.
 */
export const dynamic = "force-dynamic";

export default async function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; experienceSlug: string }>;
}) {
  const { locale, slug, experienceSlug } = await params;
  setRequestLocale(locale);

  const experience = await getExperienceDetail(slug, experienceSlug, locale);
  if (!experience) notFound();

  const supabase = await webSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const here = `/${locale}/destinations/${slug}/experiences/${experienceSlug}`;
  const t = await getTranslations("addToJourney");
  const journeys = user ? await listJourneysAt(supabase, experience.destinationId) : [];
  const choices = journeys.map((journey) => ({
    id: journey.id,
    title: journey.title ?? t("untitled"),
    dayLabels: Array.from({ length: journey.dayCount }, (_, index) =>
      journey.startDate
        ? t("day_option_dated", {
            day: index + 1,
            date: formatDate(dateForDay(journey.startDate, index), locale) ?? "",
          })
        : t("day_option", { day: index + 1 }),
    ),
  }));

  return (
    <ExperienceDetailBody
      experience={experience}
      locale={locale}
      actions={{
        journeys: choices,
        signInHref: user ? null : `/${locale}/sign-in?next=${encodeURIComponent(here)}`,
      }}
    />
  );
}
