"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { OpsDataTable } from "@mandhira/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PublishStatusTag } from "./publish-status-tag";

export type EntityRow = {
  id: string;
  slug: string;
  name_i18n: unknown;
  status: string;
  /** Extra columns, rendered in `columnOrder`. Values are already display-ready. */
  columns: Record<string, string>;
};

/**
 * The list table shared by the knowledge editors.
 *
 * Every entity list is the same shape — name, a few entity-specific columns, publish
 * status — so this exists rather than a near-identical table per screen. Anything genuinely
 * different (places' schedule indicator, for instance) passes through `columns` as a
 * prepared string, which keeps the component from growing per-entity branches.
 */
export function EntityTable({
  rows,
  basePath,
  columnOrder,
  caption,
  emptyTitle,
  emptyBody,
}: {
  rows: EntityRow[];
  basePath: string;
  columnOrder: string[];
  caption: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  const [selected, setSelected] = useState({});

  const columns = useMemo<ColumnDef<EntityRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`${basePath}/${row.original.id}`}
            className="focus-ring font-medium text-brand-primary-text hover:underline"
          >
            {displayName(row.original.name_i18n, row.original.slug)}
          </Link>
        ),
      },
      ...columnOrder.map<ColumnDef<EntityRow, unknown>>((key) => ({
        id: key,
        header: key,
        cell: ({ row }) => row.original.columns[key] ?? "—",
      })),
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <PublishStatusTag status={row.original.status} />,
      },
    ],
    [basePath, columnOrder],
  );

  return (
    <OpsDataTable
      caption={caption}
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      selection={{ value: selected, onChange: setSelected }}
      empty={
        <div className="text-center">
          <p className="text-body font-medium">{emptyTitle}</p>
          <p className="mt-1 text-body-sm text-text-secondary">{emptyBody}</p>
        </div>
      }
    />
  );
}

/** English name with a visible fallback — PRD-KNOW-005 forbids a silent blank. */
function displayName(value: unknown, slug: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["en", ...Object.keys(record)]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
    }
  }
  return slug;
}
