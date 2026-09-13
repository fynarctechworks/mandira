import { describe, expect, it } from "vitest";

import {
  groupPhrases,
  mediaUrl,
  presentPhrase,
  readTranslations,
  showText,
  type PhraseRow,
} from "./phrases";

function row(over: Partial<PhraseRow> = {}): PhraseRow {
  return {
    id: "p1",
    destination_id: "d1",
    context_tag: "directions",
    source_locale: "en",
    source_text: "Where is the east gate?",
    translations: {
      te: { text: "తూర్పు ద్వారం ఎక్కడ ఉంది?", transliteration: "turpu dvaram ekkada undi?" },
      hi: { text: "पूर्वी द्वार कहाँ है?" },
    },
    sort_order: 0,
    audio_url: null,
    ...over,
  };
}

describe("presentPhrase", () => {
  it("means the source text for a traveler reading the source language", () => {
    const phrase = presentPhrase(row(), "en")!;
    expect(phrase.meaning).toEqual({
      text: "Where is the east gate?",
      locale: "en",
      isFallback: false,
    });
    // Every other language is something to say, with its transliteration when there is one.
    expect(phrase.say).toEqual([
      { locale: "hi", text: "पूर्वी द्वार कहाँ है?", transliteration: null },
      {
        locale: "te",
        text: "తూర్పు ద్వారం ఎక్కడ ఉంది?",
        transliteration: "turpu dvaram ekkada undi?",
      },
    ]);
  });

  it("means the traveler's own translation, and never offers it back as something to say", () => {
    const phrase = presentPhrase(row(), "te")!;
    expect(phrase.meaning.text).toBe("తూర్పు ద్వారం ఎక్కడ ఉంది?");
    expect(phrase.meaning.isFallback).toBe(false);
    expect(phrase.say.map((line) => line.locale)).toEqual(["hi"]);
  });

  it("labels the source text as a fallback when the traveler's language is missing", () => {
    const phrase = presentPhrase(row({ translations: { te: { text: "తూర్పు" } } }), "hi")!;
    expect(phrase.meaning).toEqual({
      text: "Where is the east gate?",
      locale: "en",
      isFallback: true,
    });
  });

  it("does not offer the authoring language as a language of the destination", () => {
    const phrase = presentPhrase(row(), "hi")!;
    expect(phrase.say.map((line) => line.locale)).toEqual(["te"]);
  });

  it("skips malformed translations and unknown situations", () => {
    expect(readTranslations({ te: { text: "" }, hi: "text", ta: null }).size).toBe(0);
    expect(presentPhrase(row({ context_tag: "shopping" }), "en")).toBeNull();
    expect(presentPhrase(row({ source_text: " ", translations: {} }), "en")).toBeNull();
  });
});

describe("groupPhrases", () => {
  it("groups by situation in the fixed order, sorted within, empty groups left out", () => {
    const groups = groupPhrases(
      [
        row({ id: "help-1", context_tag: "help", sort_order: 1 }),
        row({ id: "dir-2", context_tag: "directions", sort_order: 2 }),
        row({ id: "help-0", context_tag: "help", sort_order: 0 }),
        row({ id: "dir-1", context_tag: "directions", sort_order: 1 }),
      ],
      "en",
    );

    expect(groups.map((g) => g.context)).toEqual(["directions", "help"]);
    expect(groups[0]!.phrases.map((p) => p.id)).toEqual(["dir-1", "dir-2"]);
    expect(groups[1]!.phrases.map((p) => p.id)).toEqual(["help-0", "help-1"]);
  });

  it("is empty for an empty pack", () => {
    expect(groupPhrases([], "en")).toEqual([]);
  });
});

describe("showText", () => {
  it("shows the first thing to say, or the meaning when there is nothing else", () => {
    expect(showText(presentPhrase(row(), "en")!)).toEqual({
      text: "पूर्वी द्वार कहाँ है?",
      locale: "hi",
    });
    const onlyOwn = presentPhrase(row({ translations: { te: { text: "సహాయం" } } }), "te")!;
    expect(showText(onlyOwn).text).toBe("సహాయం");
  });
});

describe("mediaUrl", () => {
  it("builds a public media URL, encoding each path segment", () => {
    expect(mediaUrl("http://127.0.0.1:54321/", "audio/east gate.mp3")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/media/audio/east%20gate.mp3",
    );
  });

  it("is null without a host or a path", () => {
    expect(mediaUrl(undefined, "audio/a.mp3")).toBeNull();
    expect(mediaUrl("http://host", null)).toBeNull();
  });
});
