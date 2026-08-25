"use client";

import {
  type ColumnDef,
  type RowSelectionState,
  type Updater,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type OpsDataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Stable row id — required for selection to survive re-sorting and refetching. */
  getRowId: (row: TData) => string;
  /** Omit to disable bulk select entirely. */
  selection?: {
    value: RowSelectionState;
    onChange: (value: RowSelectionState) => void;
  };
  /** Shown instead of the table body when there is nothing to list. */
  empty?: ReactNode;
  caption?: string;
  className?: string;
};

/**
 * PRD §12.5 Ops data table: sticky header, 13/18 type, 40 px rows, bulk select.
 *
 * A thin typed wrapper over `@tanstack/react-table` rather than a feature-rich component.
 * Sorting, filtering and pagination are added when a screen actually needs them — guessing
 * now would bake in assumptions before the first real list exists (B-009).
 */
export function OpsDataTable<TData>({
  columns,
  data,
  getRowId,
  selection,
  empty,
  caption,
  className,
}: OpsDataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: selection !== undefined,
    // Selection options are spread in only when selection is enabled: under
    // `exactOptionalPropertyTypes` an explicit `undefined` is not a valid option value.
    ...(selection
      ? {
          state: { rowSelection: selection.value },
          onRowSelectionChange: (updater: Updater<RowSelectionState>) =>
            selection.onChange(typeof updater === "function" ? updater(selection.value) : updater),
        }
      : {}),
  });

  const rows = table.getRowModel().rows;
  const allSelected = selection !== undefined && rows.length > 0 && table.getIsAllRowsSelected();
  const someSelected = selection !== undefined && table.getIsSomeRowsSelected();

  if (rows.length === 0 && empty) {
    return (
      <div className={cn("rounded-card border border-border-subtle bg-surface p-8", className)}>
        {empty}
      </div>
    );
  }

  return (
    // Horizontal scrolling stays inside the table's own container so the page never
    // scrolls sideways on a narrow window.
    <div
      className={cn(
        "overflow-x-auto rounded-card border border-border-subtle bg-surface",
        className,
      )}
    >
      <table className="w-full border-collapse text-left text-[13px] leading-[18px]">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sticky top-0 z-10 bg-surface-raised">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border-subtle">
              {selection ? (
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="focus-ring size-4 align-middle"
                    aria-label="Select all rows"
                    checked={allSelected}
                    ref={(el) => {
                      // Indeterminate is not an attribute — it has to be set on the node.
                      if (el) el.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={table.getToggleAllRowsSelectedHandler()}
                  />
                </th>
              ) : null}
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-3 py-2 font-medium text-text-secondary"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-selected={row.getIsSelected() || undefined}
              className="h-10 border-b border-border-subtle last:border-b-0 data-[selected]:bg-brand-primary-soft"
            >
              {selection ? (
                <td className="px-3">
                  <input
                    type="checkbox"
                    className="focus-ring size-4 align-middle"
                    aria-label="Select row"
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                  />
                </td>
              ) : null}
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="max-w-[28rem] truncate px-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { OpsDataTableProps };
