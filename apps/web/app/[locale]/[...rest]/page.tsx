import { notFound } from "next/navigation";

/**
 * Any path under a locale that matches no screen.
 *
 * Without this, `/en/anything-mistyped` matched no route at all, so Next rendered the ROOT
 * not-found — outside the locale layout, without its fonts, theme, bottom navigation or
 * language. Calling `notFound()` from inside `[locale]` renders `[locale]/not-found.tsx`
 * in the traveler's own language and chrome, still with a 404 status.
 *
 * A catch-all has the lowest priority of any segment, so it never shadows a real screen.
 */
export default function UnknownPath(): never {
  notFound();
}
