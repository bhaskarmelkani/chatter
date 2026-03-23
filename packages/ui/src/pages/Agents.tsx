import { Link } from "react-router-dom";
import { AlertCircleIcon, ArrowRightIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { AgentSummary } from "@/types";

interface AgentsResponse {
  providers: AgentSummary[];
}

function healthBadge(status: AgentSummary["health"]["status"]) {
  if (status === "ok") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }
  if (status === "degraded") {
    return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  }
  return "border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
}

export default function Agents() {
  const { data, loading, error } = usePollingApi<AgentsResponse>(
    "/providers",
    10000,
  );
  const agents = data?.providers ?? [];
  const installed = agents.filter((agent) => agent.detection.installed).length;
  const healthy = agents.filter((agent) => agent.health.status === "ok").length;
  const degraded = agents.filter((agent) => agent.health.status !== "ok").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Agents"
        title="Installed agents"
        description="Review adapter detection, runtime health, supported capture modes, and current data coverage across every connected coding agent."
        actions={
          <Link
            to="/"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to overview
          </Link>
        }
      />

      <section className="surface-panel grid gap-4 p-5 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
        <div className="space-y-3">
          <p className="subtle-label">Adapter coverage</p>
          <p className="text-sm leading-6 text-muted-foreground">
            This page tracks which agent adapters are installed, healthy, and
            ready to contribute telemetry into the local dashboard.
          </p>
        </div>
        <SummaryCard
          label="Installed"
          value={installed}
          note="Adapters detected on this machine."
        />
        <SummaryCard
          label="Healthy"
          value={healthy}
          note="Providers currently returning an OK health state."
        />
        <SummaryCard
          label="Needs review"
          value={degraded}
          note="Providers that are degraded, missing, or returning errors."
        />
      </section>

      {error && !data ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Unable to load agent information</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="text-sm text-muted-foreground">Loading agents…</div>
      ) : null}

      {data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {agents.map((agent) => (
            <Card key={agent.id} className="bg-white/80">
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>{agent.name}</CardTitle>
                    <CardDescription>{agent.id}</CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={healthBadge(agent.health.status)}
                  >
                    {agent.health.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[24px] bg-muted/55 p-4">
                    <p className="subtle-label">Installation</p>
                    <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
                      {agent.detection.installed ? "Detected" : "Missing"}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {agent.detection.version ?? "No binary version available"}
                    </p>
                  </div>
                  <div className="rounded-[24px] bg-muted/55 p-4">
                    <p className="subtle-label">Capture modes</p>
                    <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
                      {agent.captureModes.join(", ")}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {agent.eventTypes.length} event types declared
                    </p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-border/70 bg-background/75 p-4">
                  <p className="subtle-label">Data path</p>
                  <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">
                    {agent.detection.dataPath ?? "No local data path reported"}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                    {agent.health.details}
                  </p>
                  <Link
                    to={`/agents/${agent.id}`}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "text-muted-foreground",
                    )}
                  >
                    Open detail
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
