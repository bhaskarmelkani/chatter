import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCost, formatTokens } from "@/lib/pricing";

interface Entry {
  label: string;
  title: string;
  provider: string;
  tokens: number;
  cost: number;
  active?: boolean;
}

interface SessionVolumeChartProps {
  data: Entry[];
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Entry }>;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className="surface-panel min-w-[220px] rounded-[22px] px-4 py-3 text-xs">
      <div className="font-medium text-foreground">{item.title}</div>
      <div className="mt-1 text-muted-foreground capitalize">
        {item.provider}
        {item.active ? " • live" : ""}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
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

export default function SessionVolumeChart({
  data,
}: SessionVolumeChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-background/70 text-sm text-muted-foreground">
        Session volume will appear here once telemetry is available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 18, right: 8, bottom: 4, left: -14 }}
      >
        <CartesianGrid
          vertical={false}
          stroke="hsl(var(--border))"
          strokeDasharray="4 4"
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
        />
        <YAxis yAxisId="tokens" hide />
        <YAxis yAxisId="cost" hide orientation="right" />
        <Tooltip
          cursor={{ fill: "hsl(var(--accent) / 0.08)" }}
          content={<ChartTooltip />}
        />
        <Bar
          yAxisId="tokens"
          dataKey="tokens"
          radius={[12, 12, 4, 4]}
          fill="hsl(var(--chart-2))"
          barSize={28}
        />
        <Line
          yAxisId="cost"
          type="monotone"
          dataKey="cost"
          stroke="hsl(var(--accent))"
          strokeWidth={2.5}
          dot={{
            r: 4,
            strokeWidth: 0,
            fill: "hsl(var(--accent))",
          }}
          activeDot={{
            r: 5,
            strokeWidth: 0,
            fill: "hsl(var(--accent))",
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
