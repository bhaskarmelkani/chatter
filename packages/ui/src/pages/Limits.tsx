import { Link } from "react-router-dom";
import { AlertCircleIcon, AlertTriangleIcon } from "lucide-react";
import LimitMeter from "@/components/LimitMeter";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePollingApi } from "@/hooks/useApi";
import type { RateLimit } from "@/types";

interface LimitsResponse {
  limits: RateLimit[];
}

function nearestReset(limits: RateLimit[]): string {
  if (limits.length === 0) return "No reset data yet";
  const next = [...limits].sort(
    (a, b) =>
      new Date(a.resetsAt).getTime() - new Date(b.resetsAt).getTime(),
  )[0];
  const ms = new Date(next.resetsAt).getTime() - Date.now();

  if (ms <= 0) return "Resetting now";

  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Limits() {
  const { data, loading, error } = usePollingApi<LimitsResponse>(
    "/limits",
    10000,
  );
  const limits = data?.limits ?? [];
  const rankedLimits = [...limits].sort(
    (a, b) => (b.pressurePercent ?? 0) - (a.pressurePercent ?? 0),
  );
  const highPressure = limits.filter((limit) => (limit.pressurePercent ?? 0) >= 80);
  const providers = new Set(limits.map((limit) => limit.provider)).size;
  const hottest = rankedLimits[0];

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Limits"
        title="Quota monitor"
        actions={
          <Link
            to="/agents"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open agents
          </Link>
        }
      />

      <section className="surface-panel grid gap-4 p-5 lg:grid-cols-3">
        <SummaryCard
          label="Tracked windows"
          value={limits.length}
        />
        <SummaryCard
          label="Nearest reset"
          value={nearestReset(limits)}
        />
        <SummaryCard
          label="High pressure"
          value={highPressure.length}
        />
      </section>

      {hottest ? (
        <Card className="bg-white/80">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-500 text-white">
                  <AlertTriangleIcon className="size-3.5" />
                  Hottest window
                </Badge>
              </div>
              <div>
                <h2 className="section-title capitalize">
                  {hottest.provider} • {hottest.tier}
                </h2>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] bg-muted/55 p-4">
                <p className="subtle-label">Pressure</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                  {Math.round(hottest.pressurePercent ?? 0)}%
                </p>
              </div>
              <div className="rounded-[24px] bg-muted/55 p-4">
                <p className="subtle-label">Providers reporting</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                  {providers}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error && !data ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Unable to load limit telemetry</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="text-sm text-muted-foreground">Loading limits…</div>
      ) : null}

      {data ? (
        <>
          <Card className="bg-white/80">
            <CardHeader className="border-b">
              <CardTitle>Priority windows</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 lg:grid-cols-2 xl:grid-cols-3">
              {rankedLimits.length > 0 ? (
                rankedLimits.map((limit, index) => (
                  <LimitMeter
                    key={`${limit.provider}-${limit.tier}-${index}`}
                    limit={limit}
                  />
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground lg:col-span-2 xl:col-span-3">
                  No data yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/80">
            <CardHeader className="border-b">
              <CardTitle>Quota list</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Pressure</TableHead>
                    <TableHead>Reset</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedLimits.map((limit, index) => (
                    <TableRow key={`${limit.provider}-${limit.tier}-${index}`}>
                      <TableCell className="font-medium capitalize text-foreground">
                        <Link
                          to={`/agents/${limit.provider}`}
                          className="transition-colors hover:text-primary"
                        >
                          {limit.provider}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {limit.tier}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {limit.requestsLimit > 0
                          ? `${limit.requestsUsed.toLocaleString()} / ${limit.requestsLimit.toLocaleString()}`
                          : "No data"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {limit.tokensLimit > 0
                          ? `${limit.tokensUsed.toLocaleString()} / ${limit.tokensLimit.toLocaleString()}`
                          : "No data"}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">
                        {Math.round(limit.pressurePercent ?? 0)}%
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {nearestReset([limit])}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
