import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ChecklistRow } from "./checklist-row";

function Harness({ why, badge }: { why?: string; badge?: ReactNode }) {
  const [checked, setChecked] = useState(false);
  return (
    <ChecklistRow
      label="Carry photo ID"
      checked={checked}
      onCheckedChange={setChecked}
      {...(why ? { why } : {})}
      {...(badge ? { badge } : {})}
    />
  );
}

describe("ChecklistRow", () => {
  it("associates its label with the checkbox", async () => {
    render(<Harness />);
    const checkbox = screen.getByRole("checkbox", { name: "Carry photo ID" });

    expect(checkbox).toHaveAttribute("data-state", "unchecked");
    await userEvent.click(screen.getByText("Carry photo ID"));
    expect(checkbox).toHaveAttribute("data-state", "checked");
  });

  it("keeps the 'Why?' reason collapsed until asked, and is keyboard operable", async () => {
    render(<Harness why="Entry requires government ID for all adults." />);

    const toggle = screen.getByRole("button", { name: /Why\?/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/government ID/)).not.toBeVisible();

    toggle.focus();
    await userEvent.keyboard("{Enter}");

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/government ID/)).toBeVisible();
  });

  it("omits the expander when there is no reason to show", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Why\?/ })).not.toBeInTheDocument();
  });

  it("shows a trust badge beside the task without swallowing the tap (PRD-PREP-001)", async () => {
    render(
      <Harness
        badge={
          <button type="button" aria-label="Booking requirement — where this comes from">
            Verified
          </button>
        }
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Carry photo ID" });
    const badge = screen.getByRole("button", { name: /where this comes from/ });

    /*
     * The badge is a button of its own, so it must sit OUTSIDE the label. Nested inside
     * it, a traveler reaching for "where does this come from" would tick the task
     * instead — the one interaction here that must never happen by accident.
     */
    expect(badge.closest("label")).toBeNull();

    await userEvent.click(badge);
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });
});
