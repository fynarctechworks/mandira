import { Fraunces, Inter, Noto_Sans_Devanagari, Noto_Sans_Telugu, Outfit } from "next/font/google";

/**
 * PRD 12.2 typography via next/font (subset + self-hosted at build time).
 * Apps put `fontVariables` on <html>; tokens/preset consume the CSS variables.
 */
export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "opsz"],
});

/**
 * Headings, per the shadcn `base-lyra` preset (D-148). Fraunces stays exported below: it is
 * still referenced by `--font-display` in the Tailwind preset, which the not-yet-migrated
 * routes read. It goes when the last of them does.
 */
export const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

/*
 * The two Indic faces are NOT preloaded. next/font preloads by default, and a preload is
 * unconditional: every English page spent 242 kB on Telugu and Devanagari it never draws,
 * at the highest priority, ahead of its own text. On Lighthouse's reference device (4G at
 * 1.6 Mbps) that alone was well over a second of Home's largest paint (D-233). Without
 * the preload the @font-face rules stay, and their unicode-range means a Telugu or Hindi
 * page fetches its face as soon as it renders that script — and an English page never does.
 */
export const notoSansTelugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-telugu",
  display: "swap",
  preload: false,
});

export const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-devanagari",
  display: "swap",
  preload: false,
});

export const fontVariables = [
  inter.variable,
  outfit.variable,
  fraunces.variable,
  notoSansTelugu.variable,
  notoSansDevanagari.variable,
].join(" ");
