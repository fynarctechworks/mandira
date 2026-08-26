import { setRequestLocale } from "next-intl/server";

import { NotificationPreferences } from "../../../components/notification-preferences";
import { PushToggle } from "../../../components/push-toggle";
import { formatDate } from "../../../lib/present";
import { listNotifications, readPreferences } from "../../../lib/notifications";
import { webSupabase } from "../../../lib/supabase";

/**
 * Notifications, and the switches that govern them (PRD F15).
 *
 * The list and the settings are one screen on purpose. PRD-NOTF-003's restraint rules only
 * mean anything if turning something off is as easy as reading it — a settings page buried
 * two taps away is how an app ends up being silenced entirely rather than tuned.
 *
 * Signed-in only; the middleware gate covers `/journeys`, and this page checks for itself.
 */
export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await webSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
        <h1 className="text-display">Notifications</h1>
        <p className="text-body text-text-secondary">
          Reminders are tied to your journeys, so they start once you have an account.
        </p>
      </main>
    );
  }

  const [notifications, prefs] = await Promise.all([
    listNotifications(supabase, locale),
    readPreferences(supabase, user.id),
  ]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <h1 className="text-display">Notifications</h1>

      <PushToggle />

      {notifications.length === 0 ? (
        /*
         * An empty list is the normal, healthy state — this product notifies rarely by
         * design. Said as a fact rather than as an absence, so it does not read as broken.
         */
        <p className="text-body text-text-secondary">
          Nothing yet. Mandhira only gets in touch about your own journey — a booking deadline, the
          morning you set off, or when something changes.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-bg-surface p-4"
            >
              <h2 className="text-h3">{notification.title}</h2>
              <p className="text-body-sm text-text-secondary">{notification.body}</p>
              {notification.sentAt ? (
                <p className="text-caption text-text-tertiary">
                  {formatDate(notification.sentAt, locale)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <NotificationPreferences initial={prefs} />
    </main>
  );
}
