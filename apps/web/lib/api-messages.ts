import { DEFAULT_LOCALE, isLocale } from "@mandhira/i18n";
import { createTranslator } from "next-intl";

import en from "../messages/en.json";
import hi from "../messages/hi.json";
import te from "../messages/te.json";

/**
 * Server messages in the traveler's language (PRD-LANG-001).
 *
 * Routes refuse in plain English sentences, written where the rule lives, and tests read
 * them that way. What a traveler sees is translated on the way out, in `withApi`: each
 * sentence maps to a key in the catalogs' `api` namespace, and the reply is rendered in the
 * language of the page that asked. English passes through untouched.
 *
 * A route that adds a sentence without a key would reach Telugu readers in English, so
 * `api-messages.test.ts` fails when any `new ApiError("…", "…")` in this app has no entry.
 */
export const API_MESSAGE_KEYS: Record<string, string> = {
  // packages/db defaults
  "Some details need a second look.": "invalid",
  "Please sign in again to continue.": "unauthenticated",
  "This account can't do that.": "forbidden",
  "We couldn't find that.": "not_found",
  "Something with that identifier already exists.": "conflict",
  "Please try again in a few minutes.": "rate_limited",
  "That didn't go through. Please try again.": "failed",
  // traveler routes
  "That's a few links in a short time. Please wait a little.": "magic_link_rate",
  "We couldn't send that link just now. Please try again in a moment.": "magic_link_failed",
  "Choose at least one thing to do, so there is something to plan around.": "nothing_chosen",
  "This journey doesn't have a destination to add to yet.": "no_destination",
  "That isn't published for this journey's destination.": "not_published_here",
  "That's already in this journey.": "already_added",
  "This journey doesn't have that day.": "no_such_day",
  "The end of the slot needs to be after its start.": "slot_end",
  "Something can't come after itself.": "after_itself",
  "Choose something on the same day. If this belongs on that day, move it there first.":
    "after_same_day",
  "That would make each of them wait for the other. Change the other one first.": "after_cycle",
  "That needs confirming before it takes effect.": "needs_confirming",
  "Give this a set time before marking it fixed — a fixed item is planned around its time.":
    "fixed_needs_time",
  "Removing something needs confirming first.": "remove_needs_confirming",
  "The new order has to include everything on that day, once.": "reorder_everything",
  "The day has to end after it starts.": "day_end_after_start",
  "The last day can't be before the first.": "last_day_order",
  "Move or remove what's planned on the later days first.": "later_days_first",
  "There's no travel time between those places yet.": "no_travel_time",
  "This is you, so it stays on your account.": "self_stays",
  "That photo can't be used. Try another one, or send the report without it.": "photo_unusable",
  // item rules (items route `refusal`)
  "That one can't move — it's a fixed time. Change its tier first if it really can.":
    "fixed_cannot_move",
  "That one can't be removed while it's fixed. Change its tier first if it really can go.":
    "fixed_cannot_remove",
  "You marked that as something you must do, so Mandhira won't remove it. Change its tier if that's no longer true.":
    "protected_cannot_remove",
  "That can't be changed.": "cannot_change",
};

/** Sentences built with a value, matched by shape. */
const PATTERNS: {
  pattern: RegExp;
  key: string;
  params: (m: RegExpExecArray) => Record<string, number>;
}[] = [
  {
    pattern: /^A journey can be up to (\d+) days\.$/,
    key: "journey_max_days",
    params: (m) => ({ days: Number(m[1]) }),
  },
];

const CATALOGS = { en, te, hi } as const;

/**
 * The language a request was made in: the page it came from (`/te/...`), else the locale
 * cookie next-intl keeps, else the default.
 */
export function localeOfRequest(request: Request): string {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const segment = new URL(referer).pathname.split("/")[1] ?? "";
      if (isLocale(segment)) return segment;
    } catch {
      // A malformed referer says nothing about the language.
    }
  }

  const cookie = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
  if (cookie && isLocale(cookie)) return cookie;

  return DEFAULT_LOCALE;
}

/** The message in the request's language; unchanged in English or when it is not catalogued. */
export function translateApiMessage(message: string, request: Request): string {
  const locale = localeOfRequest(request);
  if (locale === DEFAULT_LOCALE || !(locale in CATALOGS)) return message;

  const t = createTranslator({
    locale,
    messages: CATALOGS[locale as keyof typeof CATALOGS],
    namespace: "api",
  }) as unknown as (key: string, values?: Record<string, number>) => string;

  const key = API_MESSAGE_KEYS[message];
  if (key) return t(key);

  for (const { pattern, key: patternKey, params } of PATTERNS) {
    const match = pattern.exec(message);
    if (match) return t(patternKey, params(match));
  }

  return message;
}
