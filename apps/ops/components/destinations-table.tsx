"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { OpsDataTable } from "@mandhira/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PublishStatusTag } from "./publish-status-tag";

export type DestinationRow = {
  id: string;
  slug: string;
  name_i18n: unknown;
  region: string | null;
  state: string | null;
  status: string;
  updated_at: string;
};

/** English name with a visible fallback — PRD-KNOW-005 forbids showing a silent blank. */
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

export function DestinationsTable({ rows }: { rows: DestinationRow[] }) {
  const [selected, setSelected] = useState({});

  const columns = useMemo<ColumnDef<DestinationRow, unknown>[]>(
    () => [
      {
        accessorKey: "name_i18n",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/destinations/${row.original.id}`}
            className="focus-ring font-medium text-brand-primary-text hover:underline"
          >
            {displayName(row.original.name_i18n, row.original.slug)}
          </Link>
        ),
      },
      { accessorKey: "slug", header: "Slug" },
      {
        id: "where",
        header: "Region",
        cell: ({ row }) =>
          [row.original.region, row.original.state].filter(Boolean).join(", ") || "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <PublishStatusTag status={row.original.status} />,
      },
      {
        accessorKey: "updated_at",
        header: "Updated",
        cell: ({ row }) => new Date(row.original.updated_at).toLocaleDateString("en-IN"),
      },
    ],
    [],
  );

  return (
    <OpsDataTable
      caption="Destinations"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      selection={{ value: selected, onChange: setSelected }}
      empty={
        <div className="text-center">
          <p className="text-body font-medium">No destinations yet</p>
          <p className="mt-1 text-body-sm text-text-secondary">
            Create one to start adding places and experiences.
          </p>
        </div>
      }
    />
  );
}
