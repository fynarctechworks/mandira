"use client";

import { Navigation } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Hand a place off to whatever maps application the traveler already uses (MAPS-03).
 *
 * No key, no SDK, no tiles — just a URL. Which is the point: getting the last two hundred
 * metres to a temple gate is something Google Maps, Apple Maps and OsmAnd already do well,
 * with the traveler's own saved places, their offline downloads and their language. Mandhira
 * does not need to rebuild that, and a worse copy of it would be actively harmful at the
 * moment someone is lost.
 *
 * The label is carried alongside the coordinates so the destination arrives NAMED. A pin at
 * a bare lat/lng is hard to hold on to when you are walking; "Hill Temple" is not.
 */
export function OpenInMaps({
  latitude,
  longitude,
  label,
  className,
}: {
  latitude: number;
  longitude: number;
  label: string;
  className?: string;
}) {
  /*
   * Platform is read after mount, never during render: `navigator` does not exist on the
   * server, and computing the href inline would make the markup differ between server and
   * client — a hydration mismatch, with the traveler briefly holding the wrong link.
   *
   * Until it resolves, the geo: URI is used. It is the honest default rather than a
   * placeholder: it is the platform-neutral standard, and Android answers it directly.
   */
  const t = useTranslations("openInMaps");
  const [platform, setPlatform] = useState<"apple" | "android" | "other">("other");

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod|Macintosh/.test(ua)) setPlatform("apple");
    else if (/Android/.test(ua)) setPlatform("android");
  }, []);

  return (
    <a
      href={mapsHref(platform, latitude, longitude, label)}
      // A maps app takes over the screen. Opening in a new context means the journey is
      // still there when the traveler comes back, rather than needing to be found again.
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "focus-ring flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-body-sm font-medium"
      }
    >
      <Navigation className="size-4" aria-hidden />
      {t("action")}
      {/* Says where the link goes, because it leaves the app (WCAG 2.2 AA, PRD §12.8). */}
      <span className="sr-only">{t("opens_label", { label })}</span>
    </a>
  );
}

/**
 * The right URL for each platform.
 *
 * Apple: `maps://` is refused by Android and by desktop browsers, so `maps.apple.com` is
 * used — it opens the app on an Apple device and the web map elsewhere.
 *
 * Android: the `geo:` URI is the platform standard and lets the traveler's DEFAULT maps
 * app answer, which may well not be Google's. Someone who installed OsmAnd for offline
 * pilgrimage routes should not be dragged into a different app by us.
 *
 * Everything else: Google Maps over https, which works in any browser.
 */
export function mapsHref(
  platform: "apple" | "android" | "other",
  latitude: number,
  longitude: number,
  label: string,
): string {
  const at = `${latitude},${longitude}`;

  if (platform === "apple") {
    return `https://maps.apple.com/?ll=${at}&q=${encodeURIComponent(label)}`;
  }

  if (platform === "android") {
    // `geo:lat,lng?q=lat,lng(Label)` — the coordinates are repeated inside `q` on purpose.
    // Without it some apps treat the label as a free-text SEARCH and wander off to a
    // similarly named place in another state.
    return `geo:${at}?q=${at}(${encodeURIComponent(label)})`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${at}`;
}
