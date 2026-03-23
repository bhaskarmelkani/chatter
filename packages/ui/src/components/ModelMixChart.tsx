import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCost, formatTokens } from "../lib/pricing";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
];

interface Entry {
  model: string;
  tokens: number;
  cost: number;
}

interface Props {
  data: Entry[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Entry }>;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;
  return (
    <div className="surface-panel min-w-[200px] rounded-[22px] px-4 py-3 text-xs">
      <div className="font-medium text-foreground">{item.model}</div>
      <div className="mt-1 text-muted-foreground">{formatTokens(item.tokens)}</div>
      <div className="mt-1 text-muted-foreground">{formatCost(item.cost)}</div>
    </div>
  );
}

export default function ModelMixChart({ data }: Props) {
  const total = data.reduce((sum, entry) => sum + entry.tokens, 0);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-background/70 text-sm text-muted-foreground">
        No model mix yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="tokens"
          nameKey="model"
          cx="50%"
          cy="50%"
          innerRadius="58%"
          outerRadius="84%"
          stroke="none"
          paddingAngle={3}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          fontSize="10"
          letterSpacing="0.22em"
        >
          Tokens
        </text>
        <text
          x="50%"
          y="56%"
          textAnchor="middle"
          fill="hsl(var(--foreground))"
          fontSize="16"
          fontWeight="600"
        >
          {formatTokens(total)}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}
