import { Languages } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** The way into A17 from a destination or place page (PRD F12: "from … any place page"). */
export async function PhrasesLink({
  locale,
  destinationSlug,
}: {
  locale: string;
  destinationSlug: string;
}) {
  const t = await getTranslations("phrases");

  return (
    <Link
      href={`/${locale}/destinations/${destinationSlug}/phrases`}
      className="focus-ring flex min-h-11 items-center gap-2 self-start rounded-lg border border-border bg-bg-surface px-4 text-body-sm font-medium text-brand-primary-text"
    >
      <Languages className="size-4" aria-hidden />
      {t("link")}
    </Link>
  );
}
