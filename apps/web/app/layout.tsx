import type { ReactNode } from "react";

/**
 * Root layout.
 *
 * Deliberately minimal: `<html>` and `<body>` are emitted by the locale layout, which is
 * the first place the language is actually known. Setting `lang` here would mean guessing.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
