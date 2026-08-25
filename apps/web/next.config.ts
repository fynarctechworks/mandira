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
  transpilePackages: ["@mandhira/ui", "@mandhira/db", "@mandhira/i18n"],
  images: {
    // Supabase Storage serves media, and resizes it on delivery (D-055).
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default withSerwist(withNextIntl(nextConfig));
