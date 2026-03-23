import { useMemo, useState } from "react";
import ProviderLoadChart from "@/components/ProviderLoadChart";
import SessionList from "@/components/SessionList";
import SessionVolumeChart from "@/components/SessionVolumeChart";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePollingApi } from "@/hooks/useApi";
import { formatCost, formatTokens } from "@/lib/pricing";
import type { ProviderKind, SessionSummary } from "@/types";

type SortKey = "recency" | "cost" | "tokens";

interface SessionsResponse {
  sessions: SessionSummary[];
  total: number;
}

function providerLabel(value: string): string {
  if (value === "claude") return "Claude Code";
  if (value === "codex") return "Codex";
  return value;
}

function buildSessionVolumeData(sessions: SessionSummary[]) {
  return [...sessions]
    .slice(0, 8)
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

export default function SessionExplorer() {
  const { data: raw, loading, error } = usePollingApi<SessionsResponse>(
    "/sessions",
    5000,
  );
  const sessions = raw?.sessions ?? null;

  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderKind | "all">(
    "all",
  );
  const [sortBy, setSortBy] = useState<SortKey>("recency");

  const providerOptions = useMemo(() => {
    if (!sessions) return ["all"];
    return ["all", ...Array.from(new Set(sessions.map((session) => session.provider)))];
  }, [sessions]);

  const filtered = useMemo(() => {
    if (!sessions) return [];

    let list = sessions;

    if (providerFilter !== "all") {
      list = list.filter((session) => session.provider === providerFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((session) =>
        [session.title, session.model, session.project].some((value) =>
          value.toLowerCase().includes(q),
        ),
      );
    }

    const next = [...list];
    if (sortBy === "cost") next.sort((a, b) => b.cost - a.cost);
    if (sortBy === "tokens") {
      next.sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut));
    }
    if (sortBy === "recency") {
      next.sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
    }

    return next;
  }, [providerFilter, search, sessions, sortBy]);

  const liveCount = filtered.filter((session) => session.active).length;
  const totalTokens = filtered.reduce(
    (sum, session) => sum + session.tokensIn + session.tokensOut,
    0,
  );
  const totalCost = filtered.reduce((sum, session) => sum + session.cost, 0);
  const liveShare =
    filtered.length > 0 ? `${Math.round((liveCount / filtered.length) * 100)}%` : "0%";
  const workspaceRanking = buildWorkspaceRanking(filtered).slice(0, 5);
  const sessionVolumeData = buildSessionVolumeData(filtered);
  const providerLoad = Array.from(new Set(filtered.map((session) => session.provider))).map(
    (provider) => ({
      name: providerLabel(provider),
      sessions: filtered.filter((session) => session.provider === provider).length,
      status: "healthy" as const,
    }),
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Sessions"
        title="Session explorer"
        description="Search and rank prompt-level work across coding agents, then pivot from the filtered results into the sessions that actually matter."
      />

      <section className="surface-panel grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="space-y-3">
          <div>
            <p className="subtle-label">Filters</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Search by title, model, or workspace. All charts and widgets below
              reflect the current filtered set.
            </p>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, model, or workspace"
            className="h-11 rounded-full border-white/70 bg-background/80"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {providerOptions.map((value) => (
            <Button
              key={value}
              type="button"
              variant={providerFilter === value ? "default" : "outline"}
              size="sm"
              onClick={() => setProviderFilter(value)}
              className="capitalize"
            >
              {value}
            </Button>
          ))}
        </div>

        <Select
          value={sortBy}
          onValueChange={(value) => setSortBy(value as SortKey)}
        >
          <SelectTrigger className="h-11 w-full min-w-[170px] rounded-full border-white/70 bg-background/80 lg:w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="recency">Most recent</SelectItem>
              <SelectItem value="cost">Highest cost</SelectItem>
              <SelectItem value="tokens">Most tokens</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Visible sessions"
          value={filtered.length}
          note="Rows currently matching the active search and provider filters."
        />
        <SummaryCard
          label="Live share"
          value={liveShare}
          note="Share of the current filtered set that is still active right now."
        />
        <SummaryCard
          label="Tokens in view"
          value={formatTokens(totalTokens)}
          note="Combined visible prompt and response volume across filtered sessions."
        />
        <SummaryCard
          label="Cost in view"
          value={formatCost(totalCost)}
          note="Estimated spend represented by the filtered result set."
        />
      </div>

      {error && !sessions ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load sessions</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !sessions ? (
        <div className="text-sm text-muted-foreground">Loading sessions…</div>
      ) : null}

      {sessions ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="bg-white/80">
              <CardHeader className="border-b">
                <CardTitle>Filtered session activity</CardTitle>
                <CardDescription>
                  Derived from the current visible result set, ordered by the
                  most recent sessions in view.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-80">
                  <SessionVolumeChart data={sessionVolumeData} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/80">
              <CardHeader className="border-b">
                <CardTitle>Provider split</CardTitle>
                <CardDescription>
                  Session count by provider for the filtered result set.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-80">
                  <ProviderLoadChart data={providerLoad} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card className="bg-white/80">
              <CardHeader className="border-b">
                <CardTitle>Workspace ranking</CardTitle>
                <CardDescription>
                  Ranked by total token volume inside the active filtered set.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4">
                {workspaceRanking.length > 0 ? (
                  workspaceRanking.map((workspace) => (
                    <div
                      key={workspace.project}
                      className="rounded-[24px] border border-border/70 bg-background/75 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {workspace.project}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {workspace.sessions} session
                            {workspace.sessions === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {formatCost(workspace.cost)}
                        </Badge>
                      </div>
                      <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-foreground">
                        {formatTokens(workspace.tokens)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed px-4 py-10 text-sm text-muted-foreground">
                    Workspace rankings appear after matching sessions are visible.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/80">
              <CardHeader className="border-b">
                <CardTitle>Results</CardTitle>
                <CardDescription>
                  Ranked sessions for investigation, using the current search,
                  provider filter, and sort mode.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <SessionList sessions={filtered} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
