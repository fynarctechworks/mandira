"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { OpsDataTable } from "@mandhira/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PublishStatusTag } from "./publish-status-tag";

export type PlaceRow = {
  id: string;
  slug: string;
  name_i18n: unknown;
  place_type: string;
  status: string;
  destination_label: string;
  has_schedule: boolean;
};

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

export function PlacesTable({ rows }: { rows: PlaceRow[] }) {
  const [selected, setSelected] = useState({});

  const columns = useMemo<ColumnDef<PlaceRow, unknown>[]>(
    () => [
      {
        accessorKey: "name_i18n",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/places/${row.original.id}`}
            className="focus-ring font-medium text-brand-primary-text hover:underline"
          >
            {displayName(row.original.name_i18n, row.original.slug)}
          </Link>
        ),
      },
      { accessorKey: "destination_label", header: "Destination" },
      {
        accessorKey: "place_type",
        header: "Type",
        cell: ({ row }) => row.original.place_type.replace(/_/g, " "),
      },
      {
        // Opening hours gate publication, so their absence is worth seeing in the list
        // rather than only discovering at approval time.
        id: "schedule",
        header: "Hours",
        cell: ({ row }) =>
          row.original.has_schedule ? (
            <span className="text-status-comfortable">● Recorded</span>
          ) : (
            <span className="text-text-tertiary">○ Missing</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <PublishStatusTag status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <OpsDataTable
      caption="Places"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      selection={{ value: selected, onChange: setSelected }}
      empty={
        <div className="text-center">
          <p className="text-body font-medium">No places yet</p>
          <p className="mt-1 text-body-sm text-text-secondary">
            Add the temples, ghats and facilities travelers will visit.
          </p>
        </div>
      }
    />
  );
}
