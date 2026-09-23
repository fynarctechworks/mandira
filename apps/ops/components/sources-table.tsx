"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { OpsDataTable } from "@mandhira/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { humanLabel } from "@/lib/labels";

export type SourceRow = {
  id: string;
  name: string;
  source_type: string;
  tier: string;
  url: string | null;
  status: string;
  refresh_cadence_days: number | null;
};

/** Only T1/T2 can produce high confidence, so the tier is worth reading at a glance. */
const TIER_NOTE: Record<string, string> = {
  T1: "Official authority",
  T2: "Official org / licensed",
  T3: "Partner / service",
  T4: "Curated research",
  T5: "Traveler report",
};

export function SourcesTable({ rows }: { rows: SourceRow[] }) {
  const [selected, setSelected] = useState({});

  const columns = useMemo<ColumnDef<SourceRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/sources/${row.original.id}`}
            prefetch={false}
            className="focus-ring font-medium text-brand-primary-text hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "tier",
        header: "Tier",
        cell: ({ row }) => (
          <span>
            {row.original.tier}
            <span className="ml-1 text-text-tertiary">{TIER_NOTE[row.original.tier] ?? ""}</span>
          </span>
        ),
      },
      {
        accessorKey: "source_type",
        header: "Kind",
        cell: ({ row }) => humanLabel(row.original.source_type),
      },
      {
        id: "cadence",
        header: "Re-check",
        cell: ({ row }) =>
          row.original.refresh_cadence_days ? `every ${row.original.refresh_cadence_days} d` : "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          const mark = status === "active" ? "●" : status === "paused" ? "◐" : "▪";
          return (
            <span
              className={
                status === "active"
                  ? "text-status-comfortable"
                  : status === "paused"
                    ? "text-status-tight"
                    : "text-text-tertiary"
              }
            >
              <span aria-hidden="true">{mark}</span> {status}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <OpsDataTable
      caption="Sources"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      filter={{ label: "Filter", placeholder: "Name, tier or kind" }}
      selection={{ value: selected, onChange: setSelected }}
      empty={
        <div className="text-center">
          <p className="text-body font-medium">No sources registered</p>
          <p className="mt-1 text-body-sm text-text-secondary">
            Nothing can be verified until there is at least one source to verify against.
          </p>
        </div>
      }
    />
  );
}
