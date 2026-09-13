"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@mandhira/ui/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { Series } from "@/lib/signals";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const shortDay = (day: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );

/** Events per day, stacked. The table beside it carries the same numbers in words. */
export function SignalsChart({
  series,
  data,
  summary,
}: {
  series: Series[];
  data: Record<string, string | number>[];
  summary: string;
}) {
  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.key,
      { label: s.label, color: COLORS[i % COLORS.length] ?? "var(--chart-1)" },
    ]),
  );

  return (
    <figure className="flex flex-col gap-2">
      <ChartContainer config={config} className="h-72 w-full" role="img" aria-label={summary}>
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={shortDay}
            minTickGap={16}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(value) => shortDay(String(value))} />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="events" fill={`var(--color-${s.key})`} />
          ))}
        </BarChart>
      </ChartContainer>
      <figcaption className="text-caption text-text-secondary">{summary}</figcaption>
    </figure>
  );
}
