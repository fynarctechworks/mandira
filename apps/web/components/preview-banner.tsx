import { Eye } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Says, on every Ops preview, that this is a preview and whether travelers can see the page
 * yet (OPS-PREVIEW-01). "Can see" is read from the published view itself, so the banner and
 * the publish gate cannot disagree.
 */
export async function PreviewBanner({ visibleToTravelers }: { visibleToTravelers: boolean }) {
  const t = await getTranslations("preview");

  return (
    <section
      aria-labelledby="preview-banner"
      className="flex flex-col gap-1 rounded-lg border border-status-tight bg-bg-surface p-4"
    >
      <h2 id="preview-banner" className="flex items-center gap-2 text-h3">
        <Eye className="size-4" aria-hidden />
        {t("label")}
      </h2>
      <p className="text-body-sm">{visibleToTravelers ? t("visible") : t("hidden")}</p>
      <p className="text-caption text-text-secondary">{t("only_ops")}</p>
    </section>
  );
}
