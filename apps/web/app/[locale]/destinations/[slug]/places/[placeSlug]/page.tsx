import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { PlaceDetailBody } from "../../../../../../components/place-detail-body";
import { getPlaceDetail } from "../../../../../../lib/knowledge";
import { isPlaceSaved } from "../../../../../../lib/saved-places";
import { webSupabase } from "../../../../../../lib/supabase";

/**
 * Place detail (PRD F2 / F9). The page itself lives in `PlaceDetailBody`, shared with the
 * Ops preview (OPS-PREVIEW-01); this route adds what only a traveler has — saving and reporting.
 */
export const dynamic = "force-dynamic";

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; placeSlug: string }>;
}) {
  const { locale, slug, placeSlug } = await params;
  setRequestLocale(locale);

  const place = await getPlaceDetail(slug, placeSlug, locale);
  if (!place) notFound();

  const supabase = await webSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const saved = user ? await isPlaceSaved(supabase, user.id, place.id) : false;
  const here = `/${locale}/destinations/${slug}/places/${placeSlug}`;

  return (
    <PlaceDetailBody
      place={place}
      locale={locale}
      actions={{
        saved,
        signInHref: user ? null : `/${locale}/sign-in?next=${encodeURIComponent(here)}`,
      }}
    />
  );
}
