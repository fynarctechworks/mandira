import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@mandhira/ui/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mandhira",
  description: "Plan a pilgrimage around what matters to you.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#141110" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
