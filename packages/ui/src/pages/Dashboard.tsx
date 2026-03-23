import { Link } from "react-router-dom";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  RadioIcon,
  SparklesIcon,
} from "lucide-react";
import LimitMeter from "@/components/LimitMeter";
import ModelMixChart from "@/components/ModelMixChart";
import ProviderCard from "@/components/ProviderCard";
import ProviderLoadChart from "@/components/ProviderLoadChart";
import SessionList from "@/components/SessionList";
import SessionVolumeChart from "@/components/SessionVolumeChart";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePollingApi } from "@/hooks/useApi";
import { useSSE } from "@/hooks/useSSE";
import { cn } from "@/lib/utils";
import { formatCost, formatTokens } from "@/lib/pricing";
import type { DashboardMetrics, SSEEvent, SessionSummary } from "@/types";

function providerLabel(value: string): string {
  if (value === "claude") return "Claude Code";
  if (value === "codex") return "Codex";
  return value;
}

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
      return `Session activity for ${String(data?.provider ?? data?.providerId ?? "agent")}`;
    case "provider_update":
      return `Provider health changed for ${String(data?.providerId ?? "agent")}`;
    case "limit_update":
      return `Limit snapshot refreshed for ${String(data?.providerId ?? "agent")}`;
    case "dashboard":
      return "Dashboard metrics refreshed";
    case "ingest":
      return "New telemetry ingested";
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

function buildSessionVolumeData(sessions: SessionSummary[]) {
  return [...sessions]
    .slice(0, 7)
    .reverse()
    .map((session) => ({
      label: new Date(session.startedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      title: session.title || "Untitled session",
      provider: session.provider,
      tokens: session.tokensIn + session.tokensOut,
      cost: session.cost,
      active: session.active,
    }));
}

function buildWorkspaceRanking(sessions: SessionSummary[]) {
  const grouped = new Map<
    string,
    { project: string; sessions: number; tokens: number; cost: number }
  >();

  for (const session of sessions) {
    const project = session.project || "Unknown workspace";
    const current = grouped.get(project) ?? {
      project,
      sessions: 0,
      tokens: 0,
      cost: 0,
    };

    current.sessions += 1;
    current.tokens += session.tokensIn + session.tokensOut;
    current.cost += session.cost;
    grouped.set(project, current);
  }

  return Array.from(grouped.values()).sort((a, b) => b.tokens - a.tokens);
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
          The UI could not connect to the local API at 127.0.0.1:4200. Start the
          daemon first, then refresh this view.
        </AlertDescription>
      </Alert>
    );
  }

  const metrics = data!;
  const installedAgents = metrics.providers.length;
  const degradedAgents = metrics.providers.filter(
    (provider) => provider.status !== "healthy",
  );
  const highPressureLimits = [...metrics.limits]
    .sort((a, b) => (b.pressurePercent ?? 0) - (a.pressurePercent ?? 0))
    .slice(0, 4);
  const newestEvents = events.slice(0, 6);
  const sessionVolumeData = buildSessionVolumeData(metrics.recentSessions);
  const workspaceRanking = buildWorkspaceRanking(metrics.recentSessions).slice(0, 5);
  const providerLoad = metrics.providers.map((provider) => ({
    name: providerLabel(provider.provider),
    sessions: provider.activeSessions,
    status: provider.status,
  }));

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Overview"
        title="Coding agent operations"
        description="Monitor active agent work, current spend, recent session activity, provider health, and quota pressure from one clean operator surface."
        actions={
          <>
            <Link
              to="/agents"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View agents
            </Link>
            <Link to="/sessions" className={buttonVariants({ size: "sm" })}>
              Investigate sessions
            </Link>
          </>
        }
      />

      <section className="surface-panel grid gap-6 p-6 xl:grid-cols-[1.25fr_repeat(3,minmax(0,1fr))]">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="signal-dot" />
            <span className="subtle-label">Operator strip</span>
          </div>
          <div>
            <h2 className="section-title">Local daemon visibility with live context</h2>
            <p className="section-description mt-2 max-w-xl">
              This surface is optimized for recent-session activity and current
              adapter state. Charts below represent visible recent work, not
              historical reporting across a fixed time window.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant="outline"
              className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}
            >
              <RadioIcon
                className={connected ? "fill-emerald-600 text-emerald-600" : "fill-red-600 text-red-600"}
              />
              {connected ? "Live event stream" : "Event stream offline"}
            </Badge>
            <Badge variant="outline" className="border-border/70 bg-background/80">
              {newestEvents.length} recent events in memory
            </Badge>
          </div>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-background/75 p-4">
          <p className="subtle-label">Installed agents</p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground">
            {installedAgents}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Installed adapters currently visible to the local control plane.
          </p>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-background/75 p-4">
          <p className="subtle-label">Active sessions</p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground">
            {metrics.activeSessions}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Sessions currently reported as live across all connected agents.
          </p>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-background/75 p-4">
          <p className="subtle-label">Quota pressure</p>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground">
            {highPressureLimits.length}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Windows currently under elevated pressure and worth watching closely.
          </p>
        </div>
      </section>

      {degradedAgents.length > 0 || highPressureLimits.length > 0 ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>Attention needed</AlertTitle>
          <AlertDescription>
            {degradedAgents.length > 0
              ? `${degradedAgents.length} agent${degradedAgents.length > 1 ? "s are" : " is"} degraded or unreachable. `
              : ""}
            {highPressureLimits.length > 0
              ? `${highPressureLimits.length} limit window${highPressureLimits.length > 1 ? "s are" : " is"} under elevated pressure.`
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Tokens today"
          value={formatTokens(metrics.tokensToday)}
          note="Combined prompt and response volume captured in today’s telemetry."
        />
        <SummaryCard
          label="Cost today"
          value={formatCost(metrics.costToday)}
          note="Estimated spend from the current telemetry sample."
        />
        <SummaryCard
          label="Cache efficiency"
          value={formatPercent(metrics.cacheEfficiency)}
          note="Higher is better for repeated context reuse and lower prompt cost."
        />
        <SummaryCard
          label="Degraded agents"
          value={degradedAgents.length}
          note="Installed providers that are currently degraded or unreachable."
        />
        <SummaryCard
          label="Live sessions"
          value={metrics.activeSessions}
          note="Agent sessions currently active right now."
          action={
            <Badge
              variant="outline"
              className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}
            >
              {connected ? "Streaming" : "Polling only"}
            </Badge>
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Model mix</CardTitle>
            <CardDescription>
              Distribution of recent visible token volume by model.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 pt-4 lg:grid-cols-[280px_1fr]">
            <div className="h-72">
              <ModelMixChart data={metrics.modelMix} />
            </div>
            <div className="grid gap-3">
              {metrics.modelMix.length > 0 ? (
                metrics.modelMix.map((entry, index) => (
                  <div
                    key={entry.model}
                    className="rounded-[24px] border border-border/70 bg-background/75 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span
                            className="size-2.5 rounded-full"
                            style={{
                              backgroundColor: `hsl(var(--chart-${(index % 5) + 1}))`,
                            }}
                          />
                          <span className="font-medium text-foreground">
                            {entry.model}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatTokens(entry.tokens)} recent tokens
                        </p>
                      </div>
                      <span className="font-semibold text-foreground">
                        {formatCost(entry.cost)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground">
                  Model distribution appears after the daemon captures session
                  telemetry.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Provider activity</CardTitle>
            <CardDescription>
              Live session load by provider with current health state.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 pt-4">
            <div className="h-72">
              <ProviderLoadChart data={providerLoad} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] bg-muted/55 p-4">
                <p className="subtle-label">Healthy</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {metrics.providers.filter((provider) => provider.status === "healthy").length}
                </p>
              </div>
              <div className="rounded-[24px] bg-muted/55 p-4">
                <p className="subtle-label">Degraded</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {metrics.providers.filter((provider) => provider.status === "degraded").length}
                </p>
              </div>
              <div className="rounded-[24px] bg-muted/55 p-4">
                <p className="subtle-label">Unreachable</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {metrics.providers.filter((provider) => provider.status === "unreachable").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Recent-session activity</CardTitle>
            <CardDescription>
              Derived from the most recent visible sessions, not historical trend
              telemetry.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 pt-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="h-80">
              <SessionVolumeChart data={sessionVolumeData} />
            </div>
            <div className="grid gap-3">
              <div>
                <p className="subtle-label">Top workspaces</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Ranked by token volume across the current recent-session sample.
                </p>
              </div>
              {workspaceRanking.length > 0 ? (
                workspaceRanking.map((workspace) => (
                  <div
                    key={workspace.project}
                    className="rounded-[24px] border border-border/70 bg-background/75 px-4 py-3"
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {workspace.project}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{workspace.sessions} sessions</span>
                      <span>{formatCost(workspace.cost)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatTokens(workspace.tokens)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground">
                  Workspace rankings appear after recent sessions are available.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Live activity feed</CardTitle>
            <CardDescription>
              Structured daemon and ingestion updates from the current SSE stream.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4">
            {newestEvents.length > 0 ? (
              newestEvents.map((event, index) => (
                <div
                  key={`${event.type}-${event.timestamp}-${index}`}
                  className="rounded-[24px] border border-border/70 bg-background/75 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {eventSummary(event)}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {event.type.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full">
                      {formatEventTime(event.timestamp)}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground">
                Live activity will appear here once the daemon begins streaming
                events.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Provider health</CardTitle>
                <CardDescription>
                  Current adapter state, freshness, and active session posture.
                </CardDescription>
              </div>
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
            <CardDescription>
              The newest visible work across all installed agents.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <SessionList sessions={metrics.recentSessions.slice(0, 8)} compact />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/80">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Quota pressure</CardTitle>
              <CardDescription>
                Watch the hottest provider windows before work stalls or resets.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-border/70 bg-background/80">
              <SparklesIcon className="size-3.5" />
              Priority ranked
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 lg:grid-cols-2 xl:grid-cols-4">
          {highPressureLimits.length > 0 ? (
            highPressureLimits.map((limit, index) => (
              <LimitMeter
                key={`${limit.provider}-${limit.tier}-${index}`}
                limit={limit}
              />
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground lg:col-span-2 xl:col-span-4">
              Limit snapshots will appear once adapters expose recent quota
              telemetry.
            </div>
          )}
        </CardContent>
      </Card>

      {error && data ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>Showing last successful data</AlertTitle>
          <AlertDescription>
            The dashboard refreshed with an error, but previously loaded data is
            still visible.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
