import type { MetadataRoute } from "next";

/**
 * PWA manifest (TRD §11.2 Day 9).
 *
 * `display: standalone` and the brand theme colour matter beyond polish: on iOS, web push
 * and durable storage only become available once the app is installed to the home screen,
 * and offline reading is a core requirement rather than a nicety.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mandhira",
    short_name: "Mandhira",
    description: "Plan a pilgrimage around what matters to you.",
    start_url: "/en",
    display: "standalone",
    background_color: "#FBF7F2",
    theme_color: "#FF660E",
    orientation: "portrait",
    categories: ["travel", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
