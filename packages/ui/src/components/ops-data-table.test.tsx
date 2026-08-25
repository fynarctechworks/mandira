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
