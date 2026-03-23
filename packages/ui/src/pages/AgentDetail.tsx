import { Link, useParams } from "react-router-dom";
import { AlertCircleIcon } from "lucide-react";
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
import { usePollingApi } from "@/hooks/useApi";
import type { AgentDetail as AgentDetailType } from "@/types";

function formatStartedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function healthBadge(status: AgentDetailType["health"]["status"]) {
  if (status === "ok") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }
  if (status === "degraded") {
    return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  }
  return "border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = usePollingApi<AgentDetailType>(
    `/providers/${id}`,
    8000,
  );

  if (loading && !data) {
    return <div className="text-sm text-muted-foreground">Loading agent…</div>;
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Unable to load agent detail</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const agent = data!;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Agent"
        title={agent.name}
        actions={
          <>
            <Link
              to="/agents"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Back to agents
            </Link>
            <Badge variant="outline" className={healthBadge(agent.health.status)}>
              {agent.health.status}
            </Badge>
          </>
        }
      />

      <section className="surface-panel grid gap-4 p-5 lg:grid-cols-3">
        <SummaryCard
          label="Installation"
          value={agent.detection.installed ? "Detected" : "Missing"}
        />
        <SummaryCard
          label="Capture modes"
          value={agent.captureModes.length}
        />
        <SummaryCard
          label="Active sessions"
          value={agent.activeSessions.length}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Adapter profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 pt-4">
            <div className="rounded-[24px] bg-muted/55 p-4">
              <p className="subtle-label">Health detail</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {agent.health.details}
              </p>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-background/75 p-4">
              <p className="subtle-label">Data path</p>
              <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">
                {agent.detection.dataPath ?? "No local data path reported"}
              </p>
            </div>
            <div>
              <p className="subtle-label">Declared data locations</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {agent.dataLocations.map((location) => (
                  <Badge key={location} variant="outline" className="rounded-full">
                    {location}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="subtle-label">Event types</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {agent.eventTypes.map((type) => (
                  <Badge key={type} variant="outline" className="rounded-full">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80">
          <CardHeader className="border-b">
            <CardTitle>Active sessions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            {agent.activeSessions.length > 0 ? (
              agent.activeSessions.map((session) => (
                <div
                  key={session.sessionId}
                  className="rounded-[24px] border border-border/70 bg-background/75 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold tracking-[-0.02em] text-foreground">
                        {session.model ?? "Unknown model"}
                      </p>
                      <p className="mt-1 break-all text-sm text-muted-foreground">
                        {session.cwd}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full">
                      {formatStartedAt(session.startedAt)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Session ID: {session.sessionId}
                    {session.pid ? ` • PID ${session.pid}` : ""}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground">
                No active sessions.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/80">
        <CardHeader className="border-b">
          <CardTitle>Provider limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 lg:grid-cols-2 xl:grid-cols-3">
          {agent.limits.length > 0 ? (
            agent.limits.map((limit, index) => (
              <LimitMeter
                key={`${limit.provider}-${limit.tier}-${index}`}
                limit={limit}
              />
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground lg:col-span-2 xl:col-span-3">
              No limits reported.
            </div>
          )}
        </CardContent>
      </Card>

      {error && data ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>Showing last successful agent data</AlertTitle>
          <AlertDescription>
            A refresh failed, but the previously loaded agent detail is still
            visible.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
