import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, getI18n, isLocale, t } from "./index";

describe("getI18n", () => {
  const value = { en: "Morning darshan", te: "ఉదయ దర్శనం" };

  it("returns the requested locale when it exists", () => {
    expect(getI18n(value, "te")).toEqual({
      text: "ఉదయ దర్శనం",
      usedLocale: "te",
      isFallback: false,
    });
  });

  it("falls back to English and says so", () => {
    // PRD-KNOW-005: the caller must be able to label this, not show it as a translation.
    expect(getI18n(value, "hi")).toEqual({
      text: "Morning darshan",
      usedLocale: "en",
      isFallback: true,
    });
  });

  it("treats a blank string as missing rather than as a translation", () => {
    expect(getI18n({ en: "Fallback", hi: "   " }, "hi")).toEqual({
      text: "Fallback",
      usedLocale: "en",
      isFallback: true,
    });
  });

  it("uses any available locale before showing nothing", () => {
    const result = getI18n({ te: "ఉదయ దర్శనం" }, "hi");
    expect(result.text).toBe("ఉదయ దర్శనం");
    expect(result.isFallback).toBe(true);
  });

  it("returns empty rather than throwing when nothing is set", () => {
    expect(getI18n({}, "en")).toEqual({ text: "", usedLocale: null, isFallback: false });
    expect(getI18n(null, "en").text).toBe("");
    expect(getI18n(undefined, "en").text).toBe("");
  });

  it("t() gives just the string", () => {
    expect(t(value, "te")).toBe("ఉదయ దర్శనం");
  });
});

describe("locales", () => {
  it("recognises the launch locales and rejects others", () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
  });

  it("defaults to the fallback locale the content model assumes", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});

describe("the generated locale list", () => {
  it("always offers English, because every fallback ends there", () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
    expect(LOCALES[0]).toBe("en");
  });

  it("names every language it offers, in its own script", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale], `${locale} has no label`).toBeTruthy();
    }
  });

  it("holds codes a URL can carry", () => {
    for (const locale of LOCALES) {
      expect(locale).toMatch(/^[a-z]{2,3}(-[A-Z]{2})?$/);
    }
  });
});
