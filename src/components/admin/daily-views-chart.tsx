"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCount } from "@/lib/money";

// The preset ships a light-to-dark neutral ramp; chart-1 is the lightest of
// them and disappears on a white background for a single series.
const config = {
  views: { label: "Views", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function DailyViewsChart({ data }: { data: { day: string; views: number }[] }) {
  const captured = data.filter((point) => point.views > 0).length;

  if (captured === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No views have been captured for this campaign yet. Run{" "}
        <code className="rounded bg-muted px-1 py-0.5">pnpm ingest</code> to pull a day of
        metrics.
      </p>
    );
  }

  return (
    <>
      <ChartContainer config={config} className="h-64 w-full">
        <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(value: string) => format(parseISO(value), "d MMM")}
          />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => format(parseISO(String(value)), "EEEE d MMM yyyy")}
                formatter={(value) => formatCount(Number(value))}
              />
            }
          />
          <Bar dataKey="views" fill="var(--color-views)" radius={2} />
        </BarChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        {captured} of {data.length} days in the campaign period have captured metrics. Days
        without a capture are shown as zero rather than skipped, so the axis stays continuous.
      </p>
    </>
  );
}
