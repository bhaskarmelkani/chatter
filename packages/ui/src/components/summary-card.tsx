import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SummaryCardProps {
  label: string;
  value: ReactNode;
  note: string;
  action?: ReactNode;
}

export function SummaryCard({
  label,
  value,
  note,
  action,
}: SummaryCardProps) {
  return (
    <Card className="bg-white/80">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="metric-value leading-none">{value}</div>
        <p className="metric-note">{note}</p>
      </CardContent>
    </Card>
  );
}
