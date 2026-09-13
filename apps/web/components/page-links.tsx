import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Previous / next for a "See all" list. Plain links, so paging works with no JavaScript. */
export async function PageLinks({
  basePath,
  page,
  pageCount,
}: {
  basePath: string;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("discovery");
  const linkClass =
    "focus-ring flex min-h-11 items-center rounded-lg border border-border px-4 text-body-sm font-medium";

  return (
    <nav
      aria-label={t("page", { page, pages: pageCount })}
      className="flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link href={`${basePath}?page=${page - 1}`} className={linkClass} rel="prev">
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-caption text-text-secondary">
        {t("page", { page, pages: pageCount })}
      </span>
      {page < pageCount ? (
        <Link href={`${basePath}?page=${page + 1}`} className={linkClass} rel="next">
          {t("next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
