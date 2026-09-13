import { isAiConfigured } from "@mandhira/providers";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DescribeJourney } from "../../../../components/describe-journey";
import { getDestinationCards } from "../../../../lib/knowledge";

/**
 * A07, "describe your journey" — PRD F3's first path, and A08's review behind it.
 *
 * Open to guests like the questions are. Whether a model is configured is decided here, on the
 * server, so a deployment without one opens straight onto the route to the structured form
 * instead of a text box that can only fail (TRD §5.5).
 */
export const dynamic = "force-dynamic";

export default async function DescribePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("intent");
  const destinations = (await getDestinationCards(locale, 20)).map((destination) => ({
    id: destination.id,
    slug: destination.slug,
    name: destination.name.text,
  }));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("lede")}</p>
      </header>

      <DescribeJourney locale={locale} destinations={destinations} available={isAiConfigured()} />
    </main>
  );
}
