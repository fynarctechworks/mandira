import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // The service worker is skipped in development: an aggressive cache between edits makes
  // it genuinely hard to tell whether a change took effect.
  disable: process.env.NODE_ENV === "development",
  // Never reload out from under a traveler (TRD-DEPL-002); the update toast asks first.
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * The build directory is overridable, and the E2E suite overrides it.
   *
   * `next dev` and `next build` both write to `.next`, so building while a dev server is
   * running corrupts the dev server's own chunks — it starts answering every route with
   * "Cannot find module ./NNN.js" until the directory is deleted. That is a confusing
   * failure to hit twice, and it cost time here both times.
   *
   * The Playwright config already runs its servers on unusual ports for the same class of
   * reason: a test run must not collide with whatever the developer has open.
   */
  distDir: process.env["NEXT_DIST_DIR"] ?? ".next",
  transpilePackages: ["@mandhira/ui", "@mandhira/db", "@mandhira/i18n"],
  images: {
    // Supabase Storage serves media, and resizes it on delivery (D-055).
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default withSerwist(withNextIntl(nextConfig));
