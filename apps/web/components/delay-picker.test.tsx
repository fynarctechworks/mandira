import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";
import { DelayPicker } from "./delay-picker";

/**
 * PRD F6: "User taps 'I'm running late' on NOW and picks +15 / +30 / +60 / custom."
 *
 * Tested as a component rather than through Live, because the NOW card only offers its
 * actions while an item is under way — which depends on the hour the suite runs. The
 * number chosen here is the whole input to the engine, so it is the thing worth pinning.
 */
function renderPicker(onPick = vi.fn(), kind: "running_late" | "stay_longer" = "running_late") {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DelayPicker open onOpenChange={() => {}} kind={kind} onPick={onPick} />
    </NextIntlClientProvider>,
  );
  return onPick;
}

describe("DelayPicker", () => {
  it("asks how late, rather than assuming", () => {
    renderPicker();
    expect(screen.getByText("How late are you?")).toBeTruthy();
  });

  it("offers the three amounts PRD F6 names", () => {
    renderPicker();
    for (const label of ["+15 min", "+30 min", "+60 min"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("passes the amount the traveler chose to the engine", () => {
    const onPick = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "+30 min" }));
    // Not fifteen. The first version hard-coded fifteen, so someone forty-five minutes
    // behind was shown options computed for a quarter of an hour.
    expect(onPick).toHaveBeenCalledWith(30);
  });

  it("takes a custom amount", () => {
    const onPick = renderPicker();
    fireEvent.change(screen.getByLabelText(/different amount/), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(onPick).toHaveBeenCalledWith(45);
  });

  it("refuses a custom amount past the four hours the server accepts", () => {
    const onPick = renderPicker();
    fireEvent.change(screen.getByLabelText(/different amount/), { target: { value: "300" } });

    const submit = screen.getByRole("button", { name: "Use this" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("refuses nothing, zero and fractions — none of them is an amount of lateness", () => {
    const onPick = renderPicker();
    const input = screen.getByLabelText(/different amount/);
    const submit = screen.getByRole("button", { name: "Use this" }) as HTMLButtonElement;

    for (const value of ["", "0", "-10", "12.5"]) {
      fireEvent.change(input, { target: { value } });
      expect(submit.disabled, `accepted "${value}"`).toBe(true);
    }
    expect(onPick).not.toHaveBeenCalled();
  });

  it("asks the other question for Stay longer", () => {
    renderPicker(vi.fn(), "stay_longer");
    expect(screen.getByText("How much longer would you like?")).toBeTruthy();
  });
});
