import type { ColumnDef } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { OpsDataTable } from "./ops-data-table";

type Row = { id: string; name: string; status: string };

const rows: Row[] = [
  { id: "1", name: "Main Temple", status: "published" },
  { id: "2", name: "Riverside Ghat", status: "draft" },
];

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "status", header: "Status" },
];

function Harness({ data = rows }: { data?: Row[] }) {
  const [selected, setSelected] = useState({});
  return (
    <OpsDataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      selection={{ value: selected, onChange: setSelected }}
      empty={<p>Nothing here yet.</p>}
      caption="Places"
    />
  );
}

describe("OpsDataTable", () => {
  it("renders a row per record", () => {
    render(<Harness />);
    expect(screen.getByText("Main Temple")).toBeInTheDocument();
    expect(screen.getByText("Riverside Ghat")).toBeInTheDocument();
  });

  it("shows the empty state instead of a headerless table", () => {
    render(<Harness data={[]} />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("selects a single row", async () => {
    render(<Harness />);
    const rowCheckboxes = screen.getAllByRole("checkbox", { name: "Select row" });

    expect(rowCheckboxes[0]).not.toBeChecked();
    await userEvent.click(rowCheckboxes[0]!);
    expect(rowCheckboxes[0]).toBeChecked();
    expect(rowCheckboxes[1]).not.toBeChecked();
  });

  it("selects and clears every row from the header checkbox", async () => {
    render(<Harness />);
    const selectAll = screen.getByRole("checkbox", { name: "Select all rows" });

    await userEvent.click(selectAll);
    for (const box of screen.getAllByRole("checkbox", { name: "Select row" })) {
      expect(box).toBeChecked();
    }

    await userEvent.click(selectAll);
    for (const box of screen.getAllByRole("checkbox", { name: "Select row" })) {
      expect(box).not.toBeChecked();
    }
  });

  it("gives the table an accessible name", () => {
    render(<Harness />);
    const table = screen.getByRole("table", { name: "Places" });
    expect(within(table).getByText("Name")).toBeInTheDocument();
  });

  it("omits selection controls entirely when selection is not offered", () => {
    render(
      <OpsDataTable columns={columns} data={rows} getRowId={(row) => row.id} caption="Places" />,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("OpsDataTable on a long list", () => {
  const many: Row[] = Array.from({ length: 200 }, (_, i) => ({
    id: String(i),
    name: `Place ${i}`,
    status: i % 2 === 0 ? "published" : "draft",
  }));

  function Long() {
    return (
      <OpsDataTable
        columns={columns}
        data={many}
        getRowId={(row) => row.id}
        filter={{ label: "Filter", placeholder: "Name" }}
        caption="Places"
      />
    );
  }

  it("shows one page at a time and says how many rows there are in all", () => {
    render(<Long />);

    const table = screen.getByRole("table", { name: "Places" });
    expect(table).toHaveAttribute("aria-rowcount", "200");
    // Fifty rows and the header.
    expect(within(table).getAllByRole("row")).toHaveLength(51);
    expect(screen.getByText("200 rows")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–50 of 200")).toBeInTheDocument();
  });

  it("moves to the next page and back", async () => {
    render(<Long />);

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 51–100 of 200")).toBeInTheDocument();
    expect(screen.getByText("Place 50")).toBeInTheDocument();
    expect(screen.queryByText("Place 0")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Showing 1–50 of 200")).toBeInTheDocument();
  });

  it("filters to the row an operator is looking for, wherever it sits", async () => {
    render(<Long />);

    await userEvent.type(screen.getByLabelText("Filter"), "Place 137");

    expect(screen.getByText("Place 137")).toBeInTheDocument();
    expect(screen.queryByText("Place 138")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 200")).toBeInTheDocument();
  });

  it("says when a filter matches nothing, rather than looking empty", async () => {
    render(<Long />);

    await userEvent.type(screen.getByLabelText("Filter"), "nothing like this");

    expect(screen.getByText("Nothing matches that.")).toBeInTheDocument();
  });
});
