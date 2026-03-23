import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RateLimit } from "../types";

function percent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min((used / limit) * 100, 100));
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Resetting now";

  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function pressureMeta(value: number) {
  if (value >= 90) {
    return {
      label: "Critical",
      className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-50",
      barClass: "bg-red-500",
    };
  }

  if (value >= 70) {
    return {
      label: "Elevated",
      className:
        "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
      barClass: "bg-amber-500",
    };
  }

  return {
    label: "Normal",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    barClass: "bg-slate-900",
  };
}

function MeterRow({
  label,
  used,
  limit,
  barClass,
}: {
  label: string;
  used: number;
  limit: number;
  barClass: string;
}) {
  const value = percent(used, limit);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">
          {limit > 0 ? `${used.toLocaleString()} / ${limit.toLocaleString()}` : "No data"}
        </span>
      </div>
      <div className="data-bar">
        <span className={barClass} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

interface Props {
  limit: RateLimit;
}

export default function LimitMeter({ limit }: Props) {
  const requestValue = percent(limit.requestsUsed, limit.requestsLimit);
  const tokenValue = percent(limit.tokensUsed, limit.tokensLimit);
  const headlineValue =
    tokenValue > 0
      ? tokenValue
      : requestValue > 0
        ? requestValue
        : limit.pressurePercent ?? 0;
  const pressure = pressureMeta(headlineValue);

  return (
    <Card className="bg-white/80">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="subtle-label capitalize">{limit.provider}</p>
              {limit.planType ? (
                <span className="text-xs text-muted-foreground">
                  {limit.planType}
                </span>
              ) : null}
            </div>
            <CardTitle className="capitalize">{limit.tier}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Reset in {timeUntil(limit.resetsAt)}
            </p>
          </div>
          <Badge variant="outline" className={pressure.className}>
            {pressure.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-1">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/55 px-3 py-2 text-xs text-muted-foreground">
          <span>Pressure</span>
          <span className="font-semibold text-foreground">
            {Math.round(headlineValue)}%
          </span>
        </div>
        <MeterRow
          label="Requests"
          used={limit.requestsUsed}
          limit={limit.requestsLimit}
          barClass={pressure.barClass}
        />
        <MeterRow
          label="Tokens"
          used={limit.tokensUsed}
          limit={limit.tokensLimit}
          barClass={pressure.barClass}
        />
        {limit.description ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {limit.description}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
