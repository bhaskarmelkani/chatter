import { Link, useParams } from "react-router-dom";
import { AlertCircleIcon } from "lucide-react";
import ConversationView from "@/components/ConversationView";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { usePollingApi } from "@/hooks/useApi";
import {
  formatCacheRatio,
  formatCost,
  formatTokens,
} from "@/lib/pricing";
import type { SessionDetail as SessionDetailType } from "@/types";

function durationStr(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function TokenBar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const width = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">
          {formatTokens(value)}
        </span>
      </div>
      <div className="data-bar">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = usePollingApi<SessionDetailType>(
    `/sessions/${id}`,
    4000,
  );

  if (loading && !data) {
    return <div className="text-sm text-muted-foreground">Loading session…</div>;
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Unable to load this session</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const session = data!;
  const totals =
    session.tokenBreakdown.input +
    session.tokenBreakdown.output +
    session.tokenBreakdown.cacheRead +
    session.tokenBreakdown.cacheWrite;
  const longestCall = session.tools.length
    ? Math.max(...session.tools.map((tool) => tool.durationMs))
    : 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Session"
        title={session.title || "Untitled session"}
        actions={
          <>
            <Link
              to={`/agents/${session.provider}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View agent
            </Link>
            <Badge variant="outline" className="capitalize rounded-full">
              {session.provider}
            </Badge>
            {session.active ? <Badge className="rounded-full">Live capture</Badge> : null}
          </>
        }
      />

      <section className="surface-panel grid gap-4 p-5 lg:grid-cols-3">
        <Card className="bg-white/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="break-all text-sm font-medium leading-6 text-foreground">
              {session.project}
            </p>
          </CardContent>
        </Card>
        <SummaryCard
          label="Duration"
          value={durationStr(session.duration)}
        />
        <SummaryCard
          label="Estimated cost"
          value={formatCost(session.cost)}
        />
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Model"
          value={session.model}
        />
        <SummaryCard
          label="Total tokens"
          value={formatTokens(session.tokensIn + session.tokensOut)}
        />
        <SummaryCard
          label="Cache read ratio"
          value={formatCacheRatio(session.tokensIn, session.cacheRead)}
        />
        <SummaryCard
          label="Tool calls"
          value={session.tools.length}
        />
      </div>

      <Tabs defaultValue="conversation" className="gap-6">
        <TabsList className="rounded-full bg-white/70 p-1">
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
        </TabsList>

        <TabsContent value="conversation">
          <Card className="bg-white/80">
            <CardHeader className="border-b">
              <CardTitle>Prompt and response replay</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ConversationView messages={session.messages} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools">
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="grid gap-4">
              <SummaryCard
                label="Tool calls"
                value={session.tools.length}
              />
              <SummaryCard
                label="Longest call"
                value={`${longestCall}ms`}
              />
              <SummaryCard
                label="Unique tools"
                value={new Set(session.tools.map((tool) => tool.name)).size}
              />
            </div>

            <Card className="bg-white/80">
              <CardHeader className="border-b">
                <CardTitle>Captured tool activity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 pt-4">
                {session.tools.length > 0 ? (
                  session.tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="rounded-[24px] border border-border/70 bg-background/75 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{tool.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {tool.durationMs}ms
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {new Date(tool.startedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <p className="subtle-label">Input</p>
                          <pre className="overflow-auto rounded-lg border bg-background p-3 text-xs leading-6 text-foreground whitespace-pre-wrap break-all">
                            {tool.input}
                          </pre>
                        </div>
                        <div className="space-y-2">
                          <p className="subtle-label">Output</p>
                          <pre className="overflow-auto rounded-lg border bg-background p-3 text-xs leading-6 text-foreground whitespace-pre-wrap break-all">
                            {tool.output ?? "No output captured."}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground">
                    No tool calls captured.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tokens">
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card className="bg-white/80">
              <CardHeader className="border-b">
                <CardTitle>Token profile</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 pt-4">
                <TokenBar
                  label="Input"
                  value={session.tokenBreakdown.input}
                  total={totals}
                />
                <TokenBar
                  label="Output"
                  value={session.tokenBreakdown.output}
                  total={totals}
                />
                <TokenBar
                  label="Cache read"
                  value={session.tokenBreakdown.cacheRead}
                  total={totals}
                />
                <TokenBar
                  label="Cache write"
                  value={session.tokenBreakdown.cacheWrite}
                  total={totals}
                />
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <SummaryCard
                label="Prompt pressure"
                value={
                  session.tokenBreakdown.input > session.tokenBreakdown.output
                    ? "Input-heavy"
                    : "Output-heavy"
                }
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {error && data ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>Showing last successful session data</AlertTitle>
          <AlertDescription>
            A refresh failed, but the most recent loaded session details are still
            visible.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
