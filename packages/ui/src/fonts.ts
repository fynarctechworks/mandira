import { Fraunces, Inter, Noto_Sans_Devanagari, Noto_Sans_Telugu } from "next/font/google";

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

export const notoSansTelugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-telugu",
  display: "swap",
});

export const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-devanagari",
  display: "swap",
});

export const fontVariables = [
  inter.variable,
  fraunces.variable,
  notoSansTelugu.variable,
  notoSansDevanagari.variable,
].join(" ");
