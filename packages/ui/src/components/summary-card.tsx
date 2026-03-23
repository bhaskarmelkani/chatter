import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  action?: ReactNode;
}

export function SummaryCard({
  label,
  value,
  icon,
  trend,
  action,
}: SummaryCardProps) {
  return (
    <Card className="bg-white/80">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {icon ? <span className="flex items-center gap-1.5">{icon}{label}</span> : label}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="metric-value leading-none">{value}</div>
        {trend ? (
          <p className={cn(
            "text-xs",
            trend.direction === "up" && "text-emerald-600",
            trend.direction === "down" && "text-red-600",
            trend.direction === "neutral" && "text-muted-foreground",
          )}>
            {trend.value}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
