import { ArrowRight, Bell } from "lucide-react";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AccountDataControls } from "../../../components/account-data-controls";
import { LanguageSwitcher } from "../../../components/language-switcher";
import { AccountNameForm, SignOutButton } from "../../../components/profile-controls";
import { TravelersManager } from "../../../components/travelers-manager";
import { getAccount, listTravelers } from "../../../lib/account";
import { listSavedPlaces } from "../../../lib/saved-places";
import { webSupabase } from "../../../lib/supabase";

/**
 * Profile & travelers (PRD F13, A23).
 *
 * Account, language, the people the traveler journeys with, saved places, notification
 * settings, and the DPDP controls — a copy of their data and deletion — on one screen, because
 * rights that take a search to find are rights in name only. A guest still gets the language
 * switcher: choosing a language never needed an account.
 */
export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, supabase] = await Promise.all([getTranslations(), webSupabase()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
        <h1 className="text-display">{t("profile.title")}</h1>
        <p className="text-body text-text-secondary">{t("profile.signed_out")}</p>
        <Link
          href={`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/profile`)}`}
          className="focus-ring flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-4 text-body font-medium text-text-on-primary"
        >
          {t("profile.sign_in")}
        </Link>
        <LanguageSwitcher saveToProfile={false} />
      </main>
    );
  }

  const [account, travelers, saved] = await Promise.all([
    getAccount(supabase, user),
    listTravelers(supabase),
    listSavedPlaces(supabase, user.id, locale),
  ]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-4 py-6">
      <h1 className="text-display">{t("profile.title")}</h1>

      <section aria-labelledby="account" className="flex flex-col gap-3">
        <h2 id="account" className="text-h2">
          {t("profile.account")}
        </h2>
        {account.email ? (
          <dl className="flex flex-col gap-0.5">
            <dt className="text-caption text-text-secondary">{t("profile.email")}</dt>
            <dd className="text-body">{account.email}</dd>
          </dl>
        ) : null}
        <AccountNameForm initialName={account.displayName} />
        <LanguageSwitcher saveToProfile />
      </section>

      <section aria-labelledby="travelers" className="flex flex-col gap-3">
        <h2 id="travelers" className="text-h2">
          {t("travelers.title")}
        </h2>
        <TravelersManager initial={travelers} />
      </section>

      <section aria-labelledby="saved-places" className="flex flex-col gap-3">
        <h2 id="saved-places" className="text-h2">
          {t("savedPlaces.title")}
        </h2>
        {saved.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t("savedPlaces.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {saved.map((place) => (
              <li key={place.placeId}>
                <Link
                  href={`/${locale}${place.path}`}
                  className="focus-ring flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-bg-surface p-3"
                >
                  <span className="flex flex-col">
                    <span className="text-body font-medium">{place.name}</span>
                    <span className="text-caption text-text-secondary">
                      {place.destinationName}
                    </span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 text-text-secondary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="notifications" className="flex flex-col gap-2">
        <h2 id="notifications" className="text-h2">
          {t("profile.notifications")}
        </h2>
        <Link
          href={`/${locale}/notifications`}
          className="focus-ring flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-bg-surface p-3"
        >
          <span className="flex items-center gap-2 text-body-sm">
            <Bell className="size-4 shrink-0" aria-hidden />
            {t("profile.notifications_hint")}
          </span>
          <ArrowRight className="size-5 shrink-0 text-text-secondary" aria-hidden />
        </Link>
      </section>

      <section aria-labelledby="your-data" className="flex flex-col gap-3">
        <h2 id="your-data" className="text-h2">
          {t("accountData.title")}
        </h2>
        <AccountDataControls initialScheduledFor={account.erasureScheduledFor} locale={locale} />
      </section>

      <SignOutButton locale={locale} />
    </main>
  );
}
