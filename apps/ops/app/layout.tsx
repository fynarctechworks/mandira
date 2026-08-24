import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@mandhira/ui/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mandhira Ops",
  description: "Knowledge operations for Mandhira.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
