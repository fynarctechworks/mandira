import { buttonVariants } from "@mandhira/ui/components/ui/button";
import type { LocaleOption } from "@/components/i18n-fields";

/**
 * Preview-as-app (PRD-OPS-CNT-001, OPS-PREVIEW-01): opens the entity in the traveler app,
 * laid out as a traveler will see it, in each active language.
 *
 * Only a link. The traveler app decides who may look — an Ops account signed in there — and
 * reads the draft under that account's own permissions.
 */
export function PreviewInApp({
  kind,
  id,
  locales,
}: {
  kind: "places" | "experiences";
  id: string;
  locales: LocaleOption[];
}) {
  const base = (process.env["NEXT_PUBLIC_TRAVELER_APP_URL"] ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  return (
    <nav aria-label="Preview in the app" className="flex flex-wrap items-center gap-2">
      <span className="text-body-sm text-text-secondary">Preview in the app</span>
      {locales.map((locale) => (
        <a
          key={locale.code}
          href={`${base}/${locale.code}/preview/${kind}/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          {locale.label}
        </a>
      ))}
    </nav>
  );
}
