import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { ExperienceDetailBody } from "../../../../../components/experience-detail-body";
import { PreviewBanner } from "../../../../../components/preview-banner";
import { getExperiencePreview } from "../../../../../lib/knowledge";

/**
 * Ops preview of an experience (OPS-PREVIEW-01, PRD-OPS-CNT-001): the traveler's experience
 * page, drawn from the base tables so a draft can be seen before it is published.
 *
 * Signed in only (middleware) and Ops only: the loader asks `is_ops()`, and RLS gives no one
 * else a row. Never kept by the service worker, never indexed.
 */
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ExperiencePreviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const preview = await getExperiencePreview(id, locale);
  if (!preview) notFound();

  return (
    <ExperienceDetailBody
      experience={preview.experience}
      locale={locale}
      banner={<PreviewBanner visibleToTravelers={preview.visibleToTravelers} />}
    />
  );
}
