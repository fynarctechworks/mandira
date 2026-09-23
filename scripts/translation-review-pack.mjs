#!/usr/bin/env node
/**
 * Builds the pack a NATIVE SPEAKER reads (PRD-LANG-001, PRD §12.7).
 *
 * `pnpm test` already proves the catalogues line up structurally — same keys, same
 * placeholders, plurals intact. None of that says whether a sentence sounds like something
 * a pilgrim would recognise, whether the register is respectful (Telugu మీరు, Hindi आप), or
 * whether a word means in Telangana what a dictionary says it means. Those questions need
 * somebody who speaks the language; this script gives them everything they need to answer
 * without opening the repository.
 *
 * Output per locale: a CSV they can open in any spreadsheet and send back with a column
 * filled in, plus a README that says what to look for. Grouped by screen rather than by
 * key, because "is this the right word" depends entirely on what is around it.
 *
 *   pnpm i18n:review                    → ./translation-review
 *   pnpm i18n:review -- --out some/dir
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { flattenCatalog, untranslatedKeys } from "../packages/i18n/src/catalog.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MESSAGES = join(ROOT, "apps/web/messages");

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT = resolve(ROOT, outIndex === -1 ? "translation-review" : (args[outIndex + 1] ?? ""));

const LANGUAGES = {
  hi: { name: "Hindi", script: "हिन्दी", register: "आप (respectful second person)" },
  te: { name: "Telugu", script: "తెలుగు", register: "మీరు (respectful second person)" },
};

/**
 * What each namespace is, in the words of somebody who has used the app rather than read
 * it. A reviewer judging "Now" needs to know it is the heading over what to do this minute.
 * Anything not listed here is still included, under its own name.
 */
const WHERE = {
  accessibility: "Access needs — step-free routes, somewhere to sit, queue assistance",
  accountData: "Downloading or deleting everything we hold about a traveler",
  addToJourney: "Adding a place or experience to a trip",
  advisoryNotice: "A notice about something affecting a destination right now",
  api: "What the app says back when a request does not work",
  boundary: "The screen shown when something in the app breaks",
  because: 'Why a suggestion is where it is — "Because you protected X last time"',
  change: "Change Cards — what we offer when a plan stops working",
  common: "Buttons and words that appear on every screen",
  completeJourney: "Finishing a journey and looking back on it",
  conditions: "Weather and live conditions",
  dayPlan: "One day of a journey, hour by hour",
  delayPicker: "Saying how late you are, or how much longer you want to stay",
  destinationPage: "A destination: its temples, experiences and practical notes",
  discovery: "Browsing and searching for places and experiences",
  draftRecovery: "Offering back a plan that was interrupted before saving",
  fieldTrust: "Trust wording attached to one fact, like opening hours",
  firstRun: "The very first screens, before a traveler has a journey",
  health: "Journey Health — comfortable, tight, at risk, broken, and why",
  healthSheet: "The panel explaining what is making a day tight",
  home: "The first screen after opening the app",
  install: "Adding Mandhira to the phone's home screen",
  intent: "Describing a journey in your own words, then checking what Mandhira understood",
  itemActions: "Editing one stop: its priority, timing and notes",
  journeyEdit: "Changing a journey's dates, travelers or destination",
  journeyPage: "One journey in full",
  journeysList: "The list of a traveler's journeys",
  knowledgeFields: "The names of the facts we hold — opening hours, dress code, entry rules",
  language: "Choosing the language of the app",
  live: "The NOW / NEXT / LATER screen used while travelling",
  meta: "Page titles and descriptions, including what a shared link previews as",
  nav: "The navigation bar",
  notFound: "The screen shown when a link leads nowhere",
  notificationPrefs: "Choosing which reminders to receive",
  notificationsPage: "The list of reminders already sent",
  notify: "The reminders themselves — leave-by times, changes, advisories",
  offline: "What is shown with no signal",
  offlineNotice: "The banner saying saved information is being used, and from when",
  offlineDownloads: "Whether a journey is saved on this phone, how big it is, and updating it",
  openInMaps: "Handing a place over to a maps app",
  phrases: "The phrasebook a traveler shows to somebody local",
  placeTypes: "Kinds of place — temple, ghat, cloakroom, footwear counter",
  plan: "Building a plan",
  planForm: "The questions asked to start a journey",
  planPreview: "The plan offered before a traveler accepts it",
  planSimilar: "Suggesting a journey like one already made",
  prepare: "What to carry and arrange before leaving",
  prepareHub: "The preparation screen as a whole",
  prepareList: "The checklist of things to carry and arrange",
  preparePage: "Preparation for one journey",
  present: "Dates, times, durations and countdowns",
  preview: "Looking at something before it is saved or shared",
  printButton: "Printing or saving a journey as a document",
  profile: "A traveler's own details and needs",
  pushToggle: "Turning reminders on the phone on or off",
  record: "The record kept of a completed journey",
  reflection: "Looking back after a journey is over",
  reorder: "Moving stops around within a day",
  reportChange: "Reporting that something on the ground differs from what we show",
  reportPhoto: "Attaching a photo to such a report",
  saveJourney: "Saving a journey",
  savedPlaces: "Places a traveler kept for later",
  search: "Searching",
  searchFilters: "Narrowing a search",
  shareControls: "Sharing a journey with somebody else",
  sharedSummary: "What somebody sees when a journey is shared with them",
  signIn: "Signing in",
  skip: "Skipping a step",
  sourcesFooter: "The list of sources under a page",
  startToday: "Starting a journey that begins today",
  summaryPage: "The summary of a whole journey",
  summarySheet: "The panel summarising a journey",
  travelers: "Who is travelling — ages, mobility, what they need",
  trustBadge: "The word on a badge: verified, verified earlier, check locally",
  trustSheet: "The panel that opens from a badge and names the source",
  update: "Telling a traveler a new version of the app is ready",
  worstCase: "What the plan looks like if everything runs late",
};

function readCatalog(locale) {
  return JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8"));
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

const en = readCatalog("en");
const enFlat = flattenCatalog(en);
const keys = Object.keys(enFlat).sort();

/*
 * A namespace nobody has described would reach the reviewer as a bare word like
 * "planSimilar", which tells them nothing about where the string appears — and "is this
 * the right word" is a question about context. Refusing is better than shipping a pack
 * that quietly got less useful when somebody added a screen.
 */
const undescribed = [...new Set(keys.map((key) => key.split(".")[0]))].filter((n) => !WHERE[n]);
if (undescribed.length > 0) {
  console.error(
    `No description for: ${undescribed.join(", ")}\n` +
      `Add one to WHERE in ${fileURLToPath(import.meta.url)} — one line saying where in the ` +
      `app a traveler reads these strings.`,
  );
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const summaries = [];

for (const [locale, language] of Object.entries(LANGUAGES)) {
  const catalogue = readCatalog(locale);
  const flat = flattenCatalog(catalogue);
  const identical = new Set(untranslatedKeys(en, catalogue));

  const rows = [
    ["Screen", "Key", "English", language.name, "Your correction", "Comment"]
      .map(csvCell)
      .join(","),
  ];

  for (const key of keys) {
    const namespace = key.split(".")[0];
    rows.push(
      [
        WHERE[namespace] ?? namespace,
        key,
        enFlat[key],
        flat[key] ?? "",
        identical.has(key) ? "(same as English — is that right?)" : "",
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // A BOM, so Excel opens Devanagari and Telugu as UTF-8 instead of mojibake. A reviewer
  // who sees garbled text assumes the app is garbled too.
  writeFileSync(join(OUT, `${locale}.csv`), "﻿" + rows.join("\n") + "\n", "utf8");
  summaries.push({ locale, language, count: keys.length, identical: [...identical].sort() });
}

const readme = `# Translation review — Mandhira

Mandhira is a pilgrimage travel app. It plans a journey around what a traveler says matters
most, tells them what to do now and next, and says plainly where every fact came from and
how recently anybody checked it.

These files hold every word the traveler app can show, in English and in your language.
Nothing here has been reviewed by a native speaker yet. **That is what this pack is for.**
The translations were produced by an AI and checked only for structure — that each string
exists and renders. No machine can tell you whether a sentence sounds like something a
pilgrim would actually say.

## What is in the pack

${summaries
  .map(
    (s) => `- \`${s.locale}.csv\` — ${s.language.name} (${s.language.script}), ${s.count} strings.`,
  )
  .join("\n")}

Open a file in any spreadsheet program. Each row is one string:

| Column | What it is |
|---|---|
| Screen | Where in the app the traveler reads this |
| Key | Our internal name for it — please leave unchanged |
| English | The original |
| Hindi / Telugu | What we currently show, in the language of that file |
| Your correction | Write the better wording here, or leave blank if it is fine |
| Comment | Anything we should know |

## What to look for

1. **Does it sound like a person?** The app should read as a calm, knowledgeable companion
   — warm, clear, never excited and never preachy.
2. **Respectful register.** ${Object.values(LANGUAGES)
  .map((l) => `${l.name}: ${l.register}`)
  .join("; ")}. A traveler is addressed the way an elder would be.
3. **Never these.** No "urgent", no exclamation marks, no "error", "failed" or "invalid",
   no tourism superlatives ("must-see", "breathtaking"), no devotional instructions
   ("you must offer…"), and no assumption about what anybody believes. If a string reads
   that way in your language even though the English does not, that is a finding.
4. **Recommendations explain themselves.** Anywhere the app suggests something, it should
   say *because* — and it should always leave "keep as is" as a real option.
5. **Words for religious and practical things.** Darshan, aarti, prasadam, queue, cloakroom,
   footwear counter — the word a person at the temple would use, not the dictionary one.
6. **Regional wording.** If a word is right in one region and wrong in another, say so.

## What NOT to change

- The **Key** column.
- Anything in curly braces: \`{time}\`, \`{count}\`, \`{place}\`, and \`#\` inside a plural.
  These are filled in with real values. They may MOVE within the sentence — word order is
  yours to fix — but the name inside the braces must stay exactly as it is.
- The structure of a plural: \`{count, plural, one {…} other {…}}\`. Change the words inside
  each branch, not the shape. If your language needs different plural categories from the
  English, say so in the Comment column and we will restructure it.

## Strings that are identical to the English

These may be perfectly correct — \`{degrees}°C\` is the same everywhere — or they may be
strings nobody translated. They are marked in the spreadsheet too.

${summaries
  .map(
    (s) =>
      `**${s.language.name}** (${s.identical.length}):\n${
        s.identical.length ? s.identical.map((k) => `- \`${k}\``).join("\n") : "- none"
      }`,
  )
  .join("\n\n")}

## Sending it back

Return the CSV files with the "Your correction" column filled in wherever something should
change. Partial is useful — one screen reviewed properly is worth more than every screen
skimmed.

---

Generated by \`pnpm i18n:review\`. Regenerate after any change to
\`apps/web/messages/*.json\`.
`;

writeFileSync(join(OUT, "README.md"), readme, "utf8");

console.log(`Review pack written to ${OUT}`);
for (const s of summaries) {
  console.log(`  ${s.locale}.csv — ${s.count} strings, ${s.identical.length} identical to English`);
}
console.log("\nThis pack needs a native speaker. No test in this repo can replace one.");
