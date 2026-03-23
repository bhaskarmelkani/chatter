import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCost, formatTokens } from "@/lib/pricing";
import type { SessionBucket } from "@/types";

interface SessionTrendChartProps {
  data: SessionBucket[];
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SessionBucket }>;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className="surface-panel min-w-[180px] rounded-[22px] px-4 py-3 text-xs">
      <div className="font-medium text-foreground">{item.label}</div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Sessions</span>
        <span className="font-medium text-foreground">{item.sessions}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Tokens</span>
        <span className="font-medium text-foreground">
          {formatTokens(item.tokens)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Cost</span>
        <span className="font-medium text-foreground">
          {formatCost(item.cost)}
        </span>
      </div>
    </div>
  );
}

export default function SessionTrendChart({ data }: SessionTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-background/70 text-sm text-muted-foreground">
        No trend data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 18, right: 8, bottom: 4, left: -14 }}
      >
        <defs>
          <linearGradient id="tokensFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="hsl(var(--chart-2))"
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor="hsl(var(--chart-2))"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="hsl(var(--border))"
          strokeDasharray="4 4"
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis yAxisId="tokens" hide />
        <YAxis yAxisId="cost" hide orientation="right" />
        <Tooltip
          cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1 }}
          content={<ChartTooltip />}
        />
        <Area
          yAxisId="tokens"
          type="monotone"
          dataKey="tokens"
          stroke="hsl(var(--chart-2))"
          strokeWidth={2}
          fill="url(#tokensFill)"
        />
        <Line
          yAxisId="cost"
          type="monotone"
          dataKey="cost"
          stroke="hsl(var(--accent))"
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 4,
            strokeWidth: 0,
            fill: "hsl(var(--accent))",
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
