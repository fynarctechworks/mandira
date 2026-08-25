import type { NextConfig } from "next";

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
  transpilePackages: ["@mandhira/ui"],
};

export default nextConfig;
