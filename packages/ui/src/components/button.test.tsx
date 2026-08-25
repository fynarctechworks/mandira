import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("keeps its accessible name while loading and marks itself busy", async () => {
    render(<Button loading>Start planning</Button>);

    const button = screen.getByRole("button", { name: "Start planning" });
    expect(button).toHaveAttribute("aria-busy", "true");
    // PRD 12.5: the spinner replaces the visible label.
    expect(button).toBeDisabled();
  });

  it("does not fire onClick while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick when idle", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders every variant as a real button", () => {
    render(
      <>
        <Button variant="primary">One</Button>
        <Button variant="secondary">Two</Button>
        <Button variant="tertiary">Three</Button>
      </>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});
