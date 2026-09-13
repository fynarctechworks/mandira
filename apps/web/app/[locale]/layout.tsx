import { LOCALES, isLocale } from "@mandhira/i18n";
import { fontVariables } from "@mandhira/ui/fonts";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { ConnectionBanner } from "@/components/connection-banner";
import { InstallPrompt } from "@/components/install-prompt";
import { UpdateToast } from "@/components/update-toast";
import { routing } from "@/i18n/routing";
import "../globals.css";

export const metadata: Metadata = {
  title: "Mandhira",
  description: "Plan a pilgrimage around what matters to you.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Mandhira", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#141110" },
  ],
  // The app is a standalone PWA on a phone; a zoomed-out viewport would fight the
  // mobile-first layout. Zoom itself stays enabled — capping it would break 200% text
  // scale (PRD §12.8).
  width: "device-width",
  initialScale: 1,
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !isLocale(locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations("skip");

  return (
    <html lang={locale} className={fontVariables}>
      <body className="antialiased">
        <NextIntlClientProvider>
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:bg-background focus:px-4 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
          >
            {t("to_content")}
          </a>
          <ConnectionBanner />
          {/* Bottom padding leaves room for the fixed nav so content is never hidden
              behind it — including at 200% text scale, where the nav grows. */}
          <div id="content" tabIndex={-1} className="min-h-dvh pb-20 outline-none">
            {children}
          </div>
          <BottomNav />
          <InstallPrompt />
          <UpdateToast />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
