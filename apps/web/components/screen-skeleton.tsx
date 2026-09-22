import { Skeleton } from "@mandhira/ui/components/ui/skeleton";
import { getTranslations } from "next-intl/server";

/**
 * What a traveler sees while the next screen is being built (CLAUDE.md §4, TRD §9).
 *
 * Ops has had one of these since it was built; the traveler app had none across
 * twenty-six pages, so a tap on the bottom navigation showed the OLD screen, unchanged and
 * unresponsive, until the server answered. On a good connection that is a blink. On the
 * reference device over 4G it measured 359 ms — past TRD §9's 300 ms budget, and long
 * enough that a traveler taps again.
 *
 * Deliberately NEUTRAL, and placed at the locale layout so every screen inherits it. A
 * skeleton shaped like one particular page would be a lie on the other twenty-five: what
 * it promises is "a screen with a heading and some cards is coming", which is true of all
 * of them.
 *
 * `aria-busy` and a polite live region rather than a spinner with a label: a screen reader
 * should hear that something is loading once, not have the shapes described to it.
 */
export async function ScreenSkeleton() {
  /*
   * Translated, because a screen reader reads it aloud — "Loading" in English over a
   * Telugu screen is exactly the mid-sentence language switch PRD-LANG-001 forbids, and
   * the i18n coverage test caught it here before it shipped.
   *
   * `await` in a loading state looks wrong but is not: the request's messages are already
   * resolved by the layout above, so this reads them rather than fetching them.
   */
  const t = await getTranslations("common");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6" aria-busy="true">
      <span className="sr-only" role="status">
        {t("loading")}
      </span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-2/3 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
