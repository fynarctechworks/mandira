import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

import { googleSignInEnabled } from "../../../lib/auth-providers";
import { SignInForm } from "./sign-in-form";

/**
 * Traveler sign-in (A01-adjacent).
 *
 * Reached from "Save this journey", not forced at the door. The traveler app is guest-first
 * (PRD-ACCT-001): browsing, searching and building a plan all work without an account, and
 * an account is asked for at the first moment it buys the traveler something — keeping the
 * journey.
 */
export const dynamic = "force-dynamic";

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { next } = await searchParams;
  const [t, google] = await Promise.all([getTranslations("signIn"), googleSignInEnabled()]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("intro")}</p>
      </header>

      {/*
       * `next` is sanitised again in the callback route, which is where it matters. Passing
       * it through here keeps a traveler on the path they were on rather than dropping them
       * at the home screen having lost the plan they were saving.
       */}
      <SignInForm next={safeNext(next, locale)} google={google} />

      <p className="text-caption text-text-secondary">{t("email_use")}</p>

      {/*
        PRD-PRIV-005: the notice has to be reachable BEFORE consenting, so it sits on the
        screen where consent is given rather than behind the account it creates.
      */}
      <Link
        href={`/${locale}/privacy`}
        className="focus-ring flex min-h-11 items-center self-start text-body-sm font-medium text-brand-primary-text underline"
      >
        {t("privacy_link")}
      </Link>
    </main>
  );
}

/** Same-origin relative paths only — never a way to bounce someone off-site. */
function safeNext(raw: string | undefined, locale: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return `/${locale}/journeys`;
  return raw;
}
