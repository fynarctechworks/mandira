import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangeCard, type ChangeCardOption } from "./change-card";

const recommended: ChangeCardOption = {
  id: "absorb",
  label: "Leave the museum by 17:00",
  because: "Because it keeps both of your protected experiences.",
  resultingHealth: "tight",
};

const alternatives: ChangeCardOption[] = [
  { id: "shorten", label: "Shorten the museum visit", because: "Because it frees 20 minutes." },
  { id: "drop", label: "Skip the museum", because: "Because it restores a comfortable margin." },
  { id: "extra", label: "A fourth option", because: "Should never render." },
];

function renderCard(overrides: Partial<Parameters<typeof ChangeCard>[0]> = {}) {
  const onChooseOption = vi.fn();
  const onKeepAsIs = vi.fn();
  render(
    <ChangeCard
      open
      onOpenChange={() => {}}
      whatChanged="You're about 30 minutes behind."
      whyItMatters="Evening aarti starts at 6:30 PM and can't move."
      recommended={recommended}
      otherOptions={alternatives}
      keepAsIs={{ resultingHealth: "broken" }}
      onChooseOption={onChooseOption}
      onKeepAsIs={onKeepAsIs}
      {...overrides}
    />,
  );
  return { onChooseOption, onKeepAsIs };
}

describe("ChangeCard contract (PRD F6)", () => {
  it("renders the sections in the fixed PRD order", () => {
    renderCard();

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "What changed",
      "Why it matters",
      "Recommended",
      "Other options",
      "Keep my plan as is",
    ]);
  });

  it("always offers 'Keep my plan as is' and never applies without a tap", async () => {
    const { onChooseOption, onKeepAsIs } = renderCard();

    expect(onChooseOption).not.toHaveBeenCalled();
    expect(onKeepAsIs).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Keep my plan as is" }));
    expect(onKeepAsIs).toHaveBeenCalledOnce();
    expect(onChooseOption).not.toHaveBeenCalled();
  });

  it("caps alternatives at two so the card never exceeds three options", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Shorten the museum visit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip the museum" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A fourth option" })).not.toBeInTheDocument();
  });

  it("ships a reason with every option", () => {
    renderCard();

    expect(screen.getByText(recommended.because)).toBeInTheDocument();
    expect(screen.getByText(alternatives[0]!.because)).toBeInTheDocument();
    expect(screen.getByText(alternatives[1]!.because)).toBeInTheDocument();
  });

  it("passes the chosen option id back to the caller", async () => {
    const { onChooseOption } = renderCard();

    await userEvent.click(screen.getByRole("button", { name: recommended.label }));
    expect(onChooseOption).toHaveBeenCalledWith("absorb");
  });

  it("surfaces the low-confidence note when the new information isn't confirmed", () => {
    renderCard({
      lowConfidenceNote: "This isn't fully confirmed yet — you may want to check locally.",
    });
    expect(screen.getByText(/isn't fully confirmed yet/)).toBeInTheDocument();
  });
});
