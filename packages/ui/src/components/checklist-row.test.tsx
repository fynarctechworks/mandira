import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ChecklistRow } from "./checklist-row";

function Harness({ why }: { why?: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <ChecklistRow
      label="Carry photo ID"
      checked={checked}
      onCheckedChange={setChecked}
      {...(why ? { why } : {})}
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
});
