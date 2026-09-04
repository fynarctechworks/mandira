import { fontVariables } from "@mandhira/ui/fonts";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../globals.css";

/**
 * The design-system reference carries its own `<html>`/`<body>`.
 *
 * It sits OUTSIDE `app/[locale]` on purpose. This is a reference for whoever is building
 * Mandhira, not a traveller surface: it has no locale, no messages to translate, and no
 * place in the bottom navigation. Putting it under `[locale]` would have meant inventing
 * message keys for specimen labels and shipping them to travellers in two languages.
 *
 * `noindex` because a published component gallery is not something to be found in search.
 */
export const metadata: Metadata = {
  title: "Mandhira design system",
  description: "Every component in the shadcn base-lyra preset, in Mandhira's colours.",
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
