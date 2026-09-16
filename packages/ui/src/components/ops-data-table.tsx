"use client";

import {
  type ColumnDef,
  type RowSelectionState,
  type Updater,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState, type ReactNode } from "react";
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
  /**
   * Offer a filter box and pages. Needed on any list that grows past a screenful: an operator
   * looking for one temple among two hundred cannot scroll-hunt for it.
   */
  filter?: { label: string; placeholder?: string };
  /** Shown instead of the table body when there is nothing to list. */
  empty?: ReactNode;
  caption?: string;
  className?: string;
};

/** Rows per page once a list is filterable (FEATURE_INVENTORY: pages or virtualisation past 50). */
const PAGE_SIZE = 50;

/**
 * PRD §12.5 Ops data table: sticky header, 13/18 type, 40 px rows, bulk select.
 *
 * Long lists are PAGED rather than virtualised — the other half of FEATURE_INVENTORY's
 * "pagination/virtualisation for lists >50", and a deliberate step away from TRD §12.4's named
 * technique (D-209). With `@tanstack/react-virtual` driving the body, its measuring re-rendered
 * the table often enough to interrupt the navigation a row link starts: rows rendered but could
 * not be opened, by click or by keyboard. A paged row is an ordinary row, so browser find,
 * screen readers and keyboards all still reach it.
 *
 * `filter` is what makes pages navigable: it narrows to the row an operator wants rather than
 * making them walk through pages looking for it.
 */
export function OpsDataTable<TData>({
  columns,
  data,
  getRowId,
  selection,
  filter,
  empty,
  caption,
  className,
}: OpsDataTableProps<TData>) {
  const [query, setQuery] = useState("");

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: selection !== undefined,
    // Options are spread in only when the feature is enabled: under
    // `exactOptionalPropertyTypes` an explicit `undefined` is not a valid option value.
    ...(filter
      ? {
          getFilteredRowModel: getFilteredRowModel(),
          getPaginationRowModel: getPaginationRowModel(),
          onGlobalFilterChange: setQuery,
          initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZE } },
        }
      : {}),
    ...(selection
      ? {
          onRowSelectionChange: (updater: Updater<RowSelectionState>) =>
            selection.onChange(typeof updater === "function" ? updater(selection.value) : updater),
        }
      : {}),
    state: {
      ...(selection ? { rowSelection: selection.value } : {}),
      ...(filter ? { globalFilter: query } : {}),
    },
  });

  const matched = filter ? table.getFilteredRowModel().rows.length : data.length;
  const rows = table.getRowModel().rows;
  const allSelected = selection !== undefined && rows.length > 0 && table.getIsAllRowsSelected();
  const someSelected = selection !== undefined && table.getIsSomeRowsSelected();
  const pageIndex = filter ? table.getState().pagination.pageIndex : 0;
  const firstOnPage = pageIndex * PAGE_SIZE + 1;
  const lastOnPage = pageIndex * PAGE_SIZE + rows.length;
  const pages = filter ? table.getPageCount() : 1;

  const head = filter ? (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-body-sm font-medium">
        {filter.label}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          {...(filter.placeholder ? { placeholder: filter.placeholder } : {})}
          className="focus-ring min-h-9 w-64 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
        />
      </label>
      <span className="pb-1 text-caption text-text-secondary">
        {matched === data.length
          ? `${data.length} ${data.length === 1 ? "row" : "rows"}`
          : `${matched} of ${data.length}`}
      </span>
    </div>
  ) : null;

  const foot =
    filter && pages > 1 ? (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-caption text-text-secondary">
          Showing {firstOnPage}–{lastOnPage} of {matched}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="focus-ring min-h-9 rounded-button border border-border-subtle px-3 text-body-sm disabled:text-text-tertiary"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="focus-ring min-h-9 rounded-button border border-border-subtle px-3 text-body-sm disabled:text-text-tertiary"
          >
            Next
          </button>
        </div>
      </div>
    ) : null;

  const wrap = (body: ReactNode) =>
    head || foot ? (
      <div className="flex flex-col gap-3">
        {head}
        {body}
        {foot}
      </div>
    ) : (
      body
    );

  if (rows.length === 0) {
    const nothing =
      filter && query.trim() !== "" ? (
        <p className="text-body-sm text-text-secondary">Nothing matches that.</p>
      ) : (
        empty
      );

    if (nothing) {
      return wrap(
        <div className={cn("rounded-card border border-border-subtle bg-surface p-8", className)}>
          {nothing}
        </div>,
      );
    }
  }

  return wrap(
    // Horizontal scrolling stays inside the table's own container so the page never
    // scrolls sideways on a narrow window.
    <div
      className={cn(
        "overflow-x-auto rounded-card border border-border-subtle bg-surface",
        className,
      )}
    >
      <table
        aria-rowcount={matched}
        className="w-full border-collapse text-left text-[13px] leading-[18px]"
      >
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
          {rows.map((row, index) => (
            <tr
              key={row.id}
              // The header is row 1, so the first record on the first page is row 2 — counted
              // across the whole filtered list, not just this page.
              aria-rowindex={pageIndex * PAGE_SIZE + index + 2}
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
    </div>,
  );
}

export type { OpsDataTableProps };
