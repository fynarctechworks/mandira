import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";
import { VoiceInput } from "./voice-input";

/**
 * PRD §5 A07: the mic on the plan screen. Browser speech recognition, so the tests stand
 * in for it — what is being pinned is the product's behaviour around it: offered only
 * where it can work, in the traveler's language, and adding to the box rather than
 * sending anything on its own.
 */
type Fake = {
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

let last: Fake | null = null;

function installSpeech() {
  class FakeRecognition {
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: Fake["onresult"] = null;
    onend: Fake["onend"] = null;
    onerror: Fake["onerror"] = null;
    start = vi.fn();
    stop = vi.fn(() => this.onend?.());
    constructor() {
      last = this as unknown as Fake;
    }
  }
  (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"] = FakeRecognition;
}

function renderMic(onText = vi.fn(), locale = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={en}>
      <VoiceInput locale={locale} onText={onText} />
    </NextIntlClientProvider>,
  );
  return onText;
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"];
  delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
  last = null;
});

describe("VoiceInput (PRD §5 A07)", () => {
  it("offers nothing where the browser cannot hear — a mic that cannot work is worse than none", () => {
    renderMic();
    expect(screen.queryByRole("button", { name: /Speak instead/ })).toBeNull();
  });

  it("offers the mic, and says where speech goes, before anything is recorded", () => {
    installSpeech();
    renderMic();

    expect(screen.getByRole("button", { name: /Speak instead/ })).toBeTruthy();
    expect(screen.getByText(/browser's speech service/)).toBeTruthy();
    // Nothing is listening until the traveler taps.
    expect(last).toBeNull();
  });

  it("listens in the traveler's own language", () => {
    installSpeech();
    renderMic(vi.fn(), "te");

    fireEvent.click(screen.getByRole("button", { name: /Speak instead/ }));
    expect(last?.lang).toBe("te-IN");
    expect(last?.start).toHaveBeenCalled();
  });

  it("hands over what it heard, to be added to the box — it sends nothing itself", () => {
    installSpeech();
    const onText = renderMic();

    fireEvent.click(screen.getByRole("button", { name: /Speak instead/ }));
    act(() => {
      last?.onresult?.({ results: [[{ transcript: "three days in Tirumala " }]] });
    });

    expect(onText).toHaveBeenCalledWith("three days in Tirumala");
  });

  it("says plainly when the microphone is refused, and offers typing", () => {
    installSpeech();
    renderMic();

    fireEvent.click(screen.getByRole("button", { name: /Speak instead/ }));
    act(() => {
      last?.onerror?.({ error: "not-allowed" });
    });

    expect(screen.getByRole("alert").textContent).toMatch(/type instead/);
  });
});
