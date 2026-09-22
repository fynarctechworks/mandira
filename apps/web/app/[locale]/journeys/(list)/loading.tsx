import { ScreenSkeleton } from "../../../../components/screen-skeleton";

/**
 * The journeys list, while it loads.
 *
 * In a route group so it covers the LIST and not `journeys/[id]`. A `loading.tsx` makes
 * the response stream, and a streamed response has already sent its headers by the time a
 * page calls `notFound()` — so a loading state over a route that can 404 turns "this
 * journey is not here" into a 200. That is how the first version of this broke the 404
 * contract across the whole app; the group is what keeps the two apart.
 */
export default function JourneysLoading() {
  return <ScreenSkeleton />;
}
