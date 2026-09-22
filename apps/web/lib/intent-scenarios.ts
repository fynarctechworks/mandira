import type { Scenario } from "./intent-eval";

/**
 * The test set PRD-INT-006 measures against.
 *
 * One journey per scenario, said once in each launch language, labelled once. The language
 * axis is what the requirement is about — "≥85% per launch language" — so the same
 * expectation has to be reachable from all three sentences, or the number compares
 * different things.
 *
 * **These sentences are not enough on their own, and saying so is part of the work.** The
 * English ones are mine. The Telugu and Hindi ones are mine too, which means they test
 * whether the model handles MY Telugu rather than the Telugu a pilgrim from Warangal would
 * type — the most valuable thing a native speaker can add to this file is to rewrite every
 * sentence in it as they would actually say it. `pnpm i18n:review` is for interface strings;
 * this needs the same treatment and is listed beside it in the readiness report.
 *
 * The vocabulary below is the fixture destination's (`supabase/seed/0002`), so these run
 * against a real database rather than an imagined one.
 */

/** Experience slugs the scenarios may refer to, from the fixture destination. */
export const VOCABULARY = [
  "morning-darshan",
  "evening-aarti",
  "hilltop-walk",
  "temple-museum",
  "prasadam-counter",
] as const;

export const SCENARIOS: Scenario[] = [
  {
    id: "plain-three-days",
    tests: "day count and destination, both stated outright",
    text: {
      en: "Three days at the fixture temple town.",
      hi: "फ़िक्स्चर मंदिर नगरी में तीन दिन।",
      te: "ఫిక్స్చర్ ఆలయ నగరంలో మూడు రోజులు.",
    },
    expected: { dayCount: 3, destinationSuggested: false, hasUnmatched: false },
  },
  {
    id: "one-must-do",
    tests: "a named experience becomes a must-do, not a would-like",
    text: {
      en: "We must be at the morning darshan. Two days.",
      hi: "हमें सुबह के दर्शन में ज़रूर पहुँचना है। दो दिन।",
      te: "ఉదయం దర్శనానికి తప్పకుండా వెళ్లాలి. రెండు రోజులు.",
    },
    expected: { dayCount: 2, mustDo: ["morning-darshan"], wouldLike: [] },
  },
  {
    id: "must-and-like",
    tests: "the difference between what a traveler must do and would like to",
    text: {
      en: "The morning darshan is the reason we are going. If there is time, the hilltop walk.",
      hi: "हम सुबह के दर्शन के लिए ही जा रहे हैं। समय मिले तो पहाड़ी की सैर भी।",
      te: "ఉదయం దర్శనం కోసమే వెళ్తున్నాం. సమయం ఉంటే కొండపై నడక కూడా.",
    },
    expected: { mustDo: ["morning-darshan"], wouldLike: ["hilltop-walk"] },
  },
  {
    id: "senior-limited-walking",
    tests: "an age band and a mobility need, both stated",
    text: {
      en: "Going with my mother, who is 70 and cannot walk far. Two days.",
      hi: "अपनी माँ के साथ जा रहा हूँ, वे 70 की हैं और ज़्यादा नहीं चल पातीं। दो दिन।",
      te: "మా అమ్మతో వెళ్తున్నాను, ఆమెకు 70 ఏళ్లు, ఎక్కువ నడవలేరు. రెండు రోజులు.",
    },
    expected: {
      dayCount: 2,
      travelers: [
        { ageBand: "adult", mobility: "full" },
        { ageBand: "senior", mobility: "limited_walking" },
      ],
    },
  },
  {
    id: "wheelchair",
    tests: "a wheelchair is not the same as limited walking",
    text: {
      en: "My father uses a wheelchair. We need step-free routes.",
      hi: "मेरे पिता व्हीलचेयर का उपयोग करते हैं। हमें बिना सीढ़ियों वाले रास्ते चाहिए।",
      te: "మా నాన్న వీల్‌చైర్ వాడతారు. మెట్లు లేని దారులు కావాలి.",
    },
    expected: {
      travelers: [
        { ageBand: "adult", mobility: "full" },
        { ageBand: "adult", mobility: "wheelchair" },
      ],
    },
  },
  {
    id: "child",
    tests: "a child in the party",
    text: {
      en: "Two of us and our eight-year-old. Three days, nothing rushed.",
      hi: "हम दो और हमारा आठ साल का बच्चा। तीन दिन, कोई जल्दबाज़ी नहीं।",
      te: "మేము ఇద్దరం, మా ఎనిమిదేళ్ల పాప. మూడు రోజులు, తొందర వద్దు.",
    },
    expected: {
      dayCount: 3,
      pace: "relaxed",
      travelers: [
        { ageBand: "adult", mobility: "full" },
        { ageBand: "adult", mobility: "full" },
        { ageBand: "child", mobility: "full" },
      ],
    },
  },
  {
    id: "relaxed-pace",
    tests: "pace stated in words rather than named",
    text: {
      en: "We would rather see less and not hurry. Four days.",
      hi: "हम कम देखेंगे पर जल्दबाज़ी नहीं करेंगे। चार दिन।",
      te: "తక్కువ చూసినా పర్వాలేదు, తొందర వద్దు. నాలుగు రోజులు.",
    },
    expected: { dayCount: 4, pace: "relaxed" },
  },
  {
    id: "full-pace",
    tests: "the opposite, so pace is not always relaxed",
    text: {
      en: "We want to fit in as much as we can in two days.",
      hi: "हम दो दिनों में जितना हो सके उतना देखना चाहते हैं।",
      te: "రెండు రోజుల్లో వీలైనంత ఎక్కువ చూడాలని ఉంది.",
    },
    expected: { dayCount: 2, pace: "full" },
  },
  {
    id: "no-day-count",
    tests: "a sentence that does not say how long — the model must not invent one",
    text: {
      en: "I want to attend the evening aarti with my wife.",
      hi: "मैं अपनी पत्नी के साथ शाम की आरती में शामिल होना चाहता हूँ।",
      te: "నా భార్యతో కలిసి సాయంత్రం హారతికి వెళ్లాలనుకుంటున్నాను.",
    },
    // dayCount null on purpose: filling it in is the failure this scenario exists to catch.
    expected: { dayCount: null, mustDo: ["evening-aarti"] },
  },
  {
    id: "no-pace",
    tests: "silence about pace stays silence",
    text: {
      en: "Two days, the morning darshan and the museum.",
      hi: "दो दिन, सुबह के दर्शन और संग्रहालय।",
      te: "రెండు రోజులు, ఉదయం దర్శనం, మ్యూజియం.",
    },
    expected: { dayCount: 2, pace: null },
  },
  {
    id: "unmatched-request",
    tests: "something we have no experience for is reported, not silently dropped",
    text: {
      en: "Three days. We would like the morning darshan and a boat ride on the river.",
      hi: "तीन दिन। हमें सुबह के दर्शन और नदी में नाव की सवारी चाहिए।",
      te: "మూడు రోజులు. ఉదయం దర్శనం, నదిలో పడవ ప్రయాణం కావాలి.",
    },
    expected: { dayCount: 3, hasUnmatched: true },
  },
  {
    id: "everything-named",
    tests: "several experiences at once, none invented",
    text: {
      en: "Morning darshan, evening aarti and the prasadam counter. Two days, we are in no rush.",
      hi: "सुबह के दर्शन, शाम की आरती और प्रसाद काउंटर। दो दिन, कोई जल्दी नहीं।",
      te: "ఉదయం దర్శనం, సాయంత్రం హారతి, ప్రసాదం కౌంటర్. రెండు రోజులు, తొందర లేదు.",
    },
    expected: {
      dayCount: 2,
      pace: "relaxed",
      mustDo: ["evening-aarti", "morning-darshan", "prasadam-counter"],
    },
  },
];
