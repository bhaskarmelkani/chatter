import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ProviderStatus = "healthy" | "degraded" | "unreachable";

interface Entry {
  name: string;
  sessions: number;
  status: ProviderStatus;
}

interface ProviderLoadChartProps {
  data: Entry[];
}

const STATUS_COLOR: Record<ProviderStatus, string> = {
  healthy: "hsl(var(--chart-2))",
  degraded: "hsl(var(--chart-5))",
  unreachable: "hsl(var(--destructive))",
};

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
    <div className="surface-panel min-w-[180px] rounded-[22px] px-4 py-3 text-xs">
      <div className="font-medium text-foreground">{item.name}</div>
      <div className="mt-1 capitalize text-muted-foreground">{item.status}</div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Live sessions</span>
        <span className="font-medium text-foreground">{item.sessions}</span>
      </div>
    </div>
  );
}

export default function ProviderLoadChart({
  data,
}: ProviderLoadChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-background/70 text-sm text-muted-foreground">
        Provider activity appears here after the daemon detects adapters.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
      >
        <CartesianGrid
          horizontal={false}
          stroke="hsl(var(--border))"
          strokeDasharray="4 4"
        />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={92}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--accent) / 0.08)" }}
          content={<ChartTooltip />}
        />
        <Bar dataKey="sessions" radius={[0, 12, 12, 0]} barSize={18}>
          {data.map((entry) => (
            <Cell
              key={`${entry.name}-${entry.status}`}
              fill={STATUS_COLOR[entry.status]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
