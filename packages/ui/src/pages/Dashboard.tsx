import { Link } from "react-router-dom";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BotIcon,
  GaugeIcon,
  RadioIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import LimitMeter from "@/components/LimitMeter";
import ModelMixChart from "@/components/ModelMixChart";
import ProviderCard from "@/components/ProviderCard";
import ProviderLoadChart from "@/components/ProviderLoadChart";
import SessionList from "@/components/SessionList";
import SessionTrendChart from "@/components/SessionTrendChart";
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
import { usePollingApi } from "@/hooks/useApi";
import { useSSE } from "@/hooks/useSSE";
import { cn } from "@/lib/utils";
import { formatCost, formatTokens, providerLabel } from "@/lib/pricing";
import type { DashboardMetrics, SSEEvent } from "@/types";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function eventSummary(event: SSEEvent): string {
  const data =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : null;

  switch (event.type) {
    case "scheduler":
      return `${String(data?.kind ?? "Update")} for ${String(data?.providerId ?? "provider")}`;
    case "session":
    case "session_update":
      return `Session ${String(data?.provider ?? data?.providerId ?? "agent")}`;
    case "provider_update":
      return `Health ${String(data?.providerId ?? "agent")}`;
    case "limit_update":
      return `Limit ${String(data?.providerId ?? "agent")}`;
    case "dashboard":
      return "Metrics refreshed";
    case "ingest":
      return "Telemetry ingested";
    default:
      return event.type.replaceAll("_", " ");
  }
}

function formatEventTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const { data, loading, error } = usePollingApi<DashboardMetrics>(
    "/dashboard",
    5000,
  );
  const { connected, events } = useSSE();

  if (loading && !data) {
    return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Unable to reach the Chatter daemon</AlertTitle>
        <AlertDescription>
          Start the daemon first, then refresh this view.
        </AlertDescription>
      </Alert>
    );
  }

  const metrics = data!;
  const highPressureLimits = [...metrics.limits]
    .sort((a, b) => (b.pressurePercent ?? 0) - (a.pressurePercent ?? 0))
    .slice(0, 4);
  const newestEvents = events.slice(0, 6);
  const providerLoad = metrics.providerBreakdown.map((p) => ({
    name: providerLabel(p.provider),
    sessions: p.activeSessions,
    status: p.status,
  }));

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        actions={
          <>
            <Link
              to="/agents"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View agents
            </Link>
            <Link to="/sessions" className={buttonVariants({ size: "sm" })}>
              Sessions
            </Link>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Tokens today"
          value={formatTokens(metrics.tokensToday)}
          icon={<ZapIcon className="size-3.5" />}
        />
        <SummaryCard
          label="Cost today"
          value={formatCost(metrics.costToday)}
        />
        <SummaryCard
          label="Cache efficiency"
          value={formatPercent(metrics.cacheEfficiency)}
        />
        <SummaryCard
          label="Agents"
          value={metrics.providers.length}
          icon={<BotIcon className="size-3.5" />}
          trend={
            metrics.healthyCounts.degraded > 0
              ? { value: `${metrics.healthyCounts.degraded} degraded`, direction: "down" }
              : { value: "All healthy", direction: "up" }
          }
        />
        <SummaryCard
          label="Live sessions"
          value={metrics.activeSessions}
          action={
            <Badge
              variant="outline"
              className={cn(
                "rounded-full text-[0.65rem]",
                connected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              <RadioIcon className={cn("size-3", connected ? "fill-emerald-600 text-emerald-600" : "fill-red-600 text-red-600")} />
              {connected ? "Live" : "Offline"}
            </Badge>
          }
        />
        <SummaryCard
          label="Quota pressure"
          value={metrics.highPressureCount}
          icon={<GaugeIcon className="size-3.5" />}
        />
      </div>

      {/* Alert banner */}
      {metrics.healthyCounts.degraded > 0 || metrics.highPressureCount > 0 ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>Attention needed</AlertTitle>
          <AlertDescription>
            {metrics.healthyCounts.degraded > 0
              ? `${metrics.healthyCounts.degraded} degraded agent${metrics.healthyCounts.degraded > 1 ? "s" : ""}. `
              : ""}
            {metrics.highPressureCount > 0
              ? `${metrics.highPressureCount} high-pressure limit${metrics.highPressureCount > 1 ? "s" : ""}.`
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Charts row 1: 24h trend + model mix */}
      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>24h session trend</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-72">
              <SessionTrendChart data={metrics.sessionBuckets} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Model mix</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-72">
              <ModelMixChart data={metrics.modelMix} />
            </div>
            {metrics.modelMix.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {metrics.modelMix.map((entry, index) => (
                  <div
                    key={entry.model}
                    className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2 rounded-full"
                        style={{
                          backgroundColor: `hsl(var(--chart-${(index % 5) + 1}))`,
                        }}
                      />
                      <span className="font-medium">{entry.model}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{formatTokens(entry.tokens)}</span>
                      <span className="font-semibold">{formatCost(entry.cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2: provider activity + workspaces */}
      <div className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Provider load</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-56">
              <ProviderLoadChart data={providerLoad} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="text-2xl font-semibold">{metrics.healthyCounts.healthy}</p>
                <p className="subtle-label mt-1">Healthy</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="text-2xl font-semibold">{metrics.healthyCounts.degraded}</p>
                <p className="subtle-label mt-1">Degraded</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="text-2xl font-semibold">{metrics.healthyCounts.unreachable}</p>
                <p className="subtle-label mt-1">Unreachable</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Top workspaces</CardTitle>
              <Link
                to="/sessions"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-muted-foreground",
                )}
              >
                All sessions
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {metrics.workspaceRanking.length > 0 ? (
              <div className="grid gap-2">
                {metrics.workspaceRanking.slice(0, 5).map((ws) => (
                  <div
                    key={ws.project}
                    className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{ws.project}</p>
                      <p className="text-xs text-muted-foreground">
                        {ws.sessions} session{ws.sessions === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatTokens(ws.tokens)}</p>
                      <p className="text-xs text-muted-foreground">{formatCost(ws.cost)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                No data yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: provider health + recent sessions */}
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Provider health</CardTitle>
              <Link
                to="/agents"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-muted-foreground",
                )}
              >
                Open list
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4">
            {metrics.providers.map((provider) => (
              <Link
                key={provider.provider}
                to={`/agents/${provider.provider}`}
                className="block transition-transform hover:-translate-y-0.5"
              >
                <ProviderCard provider={provider} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Recent sessions</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <SessionList sessions={metrics.recentSessions.slice(0, 8)} compact />
          </CardContent>
        </Card>
      </div>

      {/* Row 4: live feed + quota pressure */}
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Live feed</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-4">
            {newestEvents.length > 0 ? (
              newestEvents.map((event, index) => (
                <div
                  key={`${event.type}-${event.timestamp}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {eventSummary(event)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatEventTime(event.timestamp)}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                No events yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Quota pressure</CardTitle>
              <Badge variant="outline" className="border-border/70 bg-background/80">
                <SparklesIcon className="size-3.5" />
                Priority ranked
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4 lg:grid-cols-2">
            {highPressureLimits.length > 0 ? (
              highPressureLimits.map((limit, index) => (
                <LimitMeter
                  key={`${limit.provider}-${limit.tier}-${index}`}
                  limit={limit}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground lg:col-span-2">
                No data yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {error && data ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>Showing last successful data</AlertTitle>
          <AlertDescription>
            A refresh failed, but previous data is still visible.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
