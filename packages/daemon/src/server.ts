import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type {
  Adapter,
  EventLedger,
  LimitSnapshot,
  NormalizedEvent,
  SessionRow,
} from "@chatter/core";
import type { Scheduler } from "./scheduler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerDeps {
  adapters: Adapter[];
  ledger: EventLedger;
  scheduler: Scheduler;
}

export interface ServerHandle {
  start(): Promise<{ host: string; port: number }>;
  stop(): Promise<void>;
  /** Raw Fastify instance (useful for tests). */
  instance: FastifyInstance;
  /** Push an event to all connected SSE clients. */
  broadcast(event: string, data: unknown): void;
}

// ---------------------------------------------------------------------------
// SSE client tracking
// ---------------------------------------------------------------------------

interface SseClient {
  id: number;
  write(chunk: string): boolean;
  close(): void;
}

let nextClientId = 0;
const sseClients = new Set<SseClient>();

function broadcastSse(event: string, data: unknown): void {
  const envelope = JSON.stringify({
    type: event,
    data,
    timestamp: new Date().toISOString(),
  });

  for (const client of sseClients) {
    try {
      client.write(`event: ${event}\ndata: ${envelope}\n\n`);
      client.write(`data: ${envelope}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createServer(
  deps: ServerDeps,
  opts?: { host?: string; port?: number },
): ServerHandle {
  const host = opts?.host ?? "127.0.0.1";
  const port = opts?.port ?? 4200;
  const uiDistDir = new URL("../../ui/dist/", import.meta.url);

  const server = Fastify({ logger: true });

  // ------ CORS (localhost origins only) ------
  void server.register(cors, {
    origin: [
      "http://localhost:4200",
      "http://localhost:5173",
      "http://127.0.0.1:4200",
      "http://127.0.0.1:5173",
    ],
  });

  const { adapters, ledger, scheduler } = deps;

  // Helper to look up an adapter by id.
  function findAdapter(id: string): Adapter | undefined {
    return adapters.find((a) => a.manifest.id === id);
  }

  // ------------------------------------------------------------------
  // GET /api/health
  // ------------------------------------------------------------------
  server.get("/api/health", async () => {
    const adapterStates: Record<string, unknown> = {};
    for (const adapter of adapters) {
      try {
        adapterStates[adapter.manifest.id] = await adapter.getHealth();
      } catch {
        adapterStates[adapter.manifest.id] = { status: "error", details: "health check threw" };
      }
    }

    return {
      status: "ok",
      uptime: process.uptime(),
      adapters: adapterStates,
      sseClients: sseClients.size,
    };
  });

  // ------------------------------------------------------------------
  // GET /api/dashboard  (aggregate endpoint for the UI dashboard)
  // ------------------------------------------------------------------
  server.get("/api/dashboard", async () => {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dayStart = startOfDay.getTime();
    const rollingWindowMs = 24 * 60 * 60 * 1000;
    const rollingWindowStart = now - rollingWindowMs;

    // Provider health
    const providers = [];
    for (const adapter of adapters) {
      const [health, detection] = await Promise.all([
        adapter.getHealth().catch(() => ({ status: "error" as const, details: "failed" })),
        adapter.detect().catch(() => ({ installed: false as const })),
      ]);
      const active = scheduler.activeSessions.get(adapter.manifest.id) ?? [];
      providers.push({
        provider: adapter.manifest.id,
        status: health.status === "ok" ? "healthy" : health.status === "degraded" ? "degraded" : "unreachable",
        version: (detection as { version?: string }).version ?? null,
        binary: null,
        instructionFile: null,
        activeSessions: active.length,
        lastChecked: new Date(now).toISOString(),
      });
    }

    // Sessions data for today's metrics
    const allSessions = ledger.getSessions({ limit: 400 });
    const visibleSessions = filterDisplaySessions(allSessions);
    const todaySessions = visibleSessions.filter((s) => s.started_at >= dayStart);
    const sessions24h = visibleSessions.filter(
      (session) =>
        session.started_at >= rollingWindowStart && session.started_at <= now,
    );

    let tokensToday = 0;
    let costToday = 0;
    let totalInput = 0;
    let totalCacheRead = 0;
    const modelTokens = new Map<string, { tokens: number; cost: number }>();

    for (const s of todaySessions) {
      const t = s.token_input + s.token_output;
      tokensToday += t;
      costToday += s.estimated_cost;
      totalInput += s.token_input;
      totalCacheRead += s.token_cache_read;

      const entry = modelTokens.get(s.model) ?? { tokens: 0, cost: 0 };
      entry.tokens += t;
      entry.cost += s.estimated_cost;
      modelTokens.set(s.model, entry);
    }

    const totalInbound = totalInput + totalCacheRead;
    const cacheEfficiency = totalInbound > 0 ? totalCacheRead / totalInbound : 0;

    const modelMix = Array.from(modelTokens.entries())
      .map(([model, v]) => ({ model, tokens: v.tokens, cost: v.cost }))
      .sort((a, b) => b.tokens - a.tokens);

    const recentSessions = buildRecentSessions(visibleSessions, 20).map((s) => ({
      id: s.id,
      title: s.title || "Untitled",
      provider: s.provider_id as "claude" | "codex",
      model: s.model || "Unknown model",
      project: s.cwd || "Unknown workspace",
      tokensIn: s.token_input,
      tokensOut: s.token_output,
      cacheRead: s.token_cache_read,
      cacheWrite: s.token_cache_creation,
      cost: s.estimated_cost,
      startedAt: new Date(s.started_at).toISOString(),
      duration: s.ended_at ? Math.round((s.ended_at - s.started_at) / 1000) : Math.round((now - s.started_at) / 1000),
      active: s.status === "active",
    }));

    // Active sessions count
    let activeSessions = 0;
    for (const list of scheduler.activeSessions.values()) {
      activeSessions += list.length;
    }

    // Limits
    const limits: unknown[] = [];
    for (const adapter of adapters) {
      const cached = scheduler.latestLimits.get(adapter.manifest.id) ?? [];
      for (const limit of cached) {
        limits.push(serializeLimit(limit));
      }
    }

    // Session buckets + provider stats: rolling 24h window
    const bucketSizeMs = 60 * 60 * 1000;
    const buckets = Array.from({ length: 24 }, (_, index) => {
      const bucketStart = rollingWindowStart + index * bucketSizeMs;

      return {
        bucketStart: new Date(bucketStart).toISOString(),
        label: new Date(bucketStart).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        sessions: 0,
        activeSessions: 0,
        tokens: 0,
        cost: 0,
      };
    });
    const providerStats = new Map<
      string,
      { sessions: number; tokens: number; cost: number }
    >();

    for (const session of sessions24h) {
      const bucketIndex = Math.floor(
        (session.started_at - rollingWindowStart) / bucketSizeMs,
      );
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        const bucket = buckets[bucketIndex];
        bucket.sessions += 1;
        bucket.tokens += session.token_input + session.token_output;
        bucket.cost += session.estimated_cost;
        if (session.status === "active") {
          bucket.activeSessions += 1;
        }
      }

      const provider = providerStats.get(session.provider_id) ?? {
        sessions: 0,
        tokens: 0,
        cost: 0,
      };
      provider.sessions += 1;
      provider.tokens += session.token_input + session.token_output;
      provider.cost += session.estimated_cost;
      providerStats.set(session.provider_id, provider);
    }

    const sessionBuckets = buckets;
    const providerBreakdown = providers
      .map((provider) => {
        const stats = providerStats.get(provider.provider) ?? {
          sessions: 0,
          tokens: 0,
          cost: 0,
        };

        return {
          provider: provider.provider,
          status: provider.status,
          activeSessions: provider.activeSessions,
          sessions24h: stats.sessions,
          tokens24h: stats.tokens,
          cost24h: stats.cost,
        };
      })
      .sort((a, b) => {
        if (b.tokens24h !== a.tokens24h) {
          return b.tokens24h - a.tokens24h;
        }

        return a.provider.localeCompare(b.provider);
      });

    // Workspace ranking: group by cwd, sort by tokens
    const wsMap = new Map<string, { project: string; sessions: number; tokens: number; cost: number }>();
    for (const s of visibleSessions) {
      const project = s.cwd || "Unknown workspace";
      const entry = wsMap.get(project) ?? { project, sessions: 0, tokens: 0, cost: 0 };
      entry.sessions++;
      entry.tokens += s.token_input + s.token_output;
      entry.cost += s.estimated_cost;
      wsMap.set(project, entry);
    }
    const workspaceRanking = Array.from(wsMap.values())
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);

    // Convenience counts (single pass)
    const healthyCounts = { healthy: 0, degraded: 0, unreachable: 0 };
    for (const p of providers) {
      if (p.status === "healthy") healthyCounts.healthy++;
      else if (p.status === "degraded") healthyCounts.degraded++;
      else healthyCounts.unreachable++;
    }

    const serializedLimits = limits as Array<{ pressurePercent?: number }>;
    const highPressureCount = serializedLimits.filter(
      (l) => (l.pressurePercent ?? 0) >= 80,
    ).length;

    return {
      tokensToday,
      costToday,
      activeSessions,
      cacheEfficiency,
      modelMix,
      recentSessions,
      providers,
      limits,
      sessionBuckets,
      providerBreakdown,
      workspaceRanking,
      healthyCounts,
      highPressureCount,
    };
  });

  // ------------------------------------------------------------------
  // GET /api/providers
  // ------------------------------------------------------------------
  server.get("/api/providers", async () => {
    const results = [];
    for (const adapter of adapters) {
      const [health, detection] = await Promise.all([
        adapter.getHealth().catch(() => ({ status: "error" as const, details: "health check failed" })),
        adapter.detect().catch(() => ({ installed: false })),
      ]);
      results.push({
        ...adapter.manifest,
        health,
        detection,
      });
    }
    return { providers: results };
  });

  // ------------------------------------------------------------------
  // GET /api/providers/:id
  // ------------------------------------------------------------------
  server.get<{ Params: { id: string } }>(
    "/api/providers/:id",
    async (request, reply) => {
      const adapter = findAdapter(request.params.id);
      if (!adapter) {
        return reply.status(404).send({ error: "provider not found" });
      }

      const [health, detection, activeSessions, limits] = await Promise.all([
        adapter.getHealth().catch(() => ({ status: "error" as const, details: "failed" })),
        adapter.detect().catch(() => ({ installed: false })),
        adapter.getActiveSessions().catch(() => []),
        adapter.getLimits().catch(() => []),
      ]);

      return {
        ...adapter.manifest,
        health,
        detection,
        activeSessions,
        limits,
      };
    },
  );

  // ------------------------------------------------------------------
  // GET /api/limits
  // ------------------------------------------------------------------
  server.get("/api/limits", async () => {
    const allLimits: Array<{
      provider: string;
      tier: string;
      requestsUsed: number;
      requestsLimit: number;
      tokensUsed: number;
      tokensLimit: number;
      resetsAt: string;
      pressurePercent?: number;
      windowMinutes: number;
      planType?: string;
      serviceTier?: string;
      telemetryMode?: "native" | "observed";
      description?: string;
    }> = [];

    for (const adapter of adapters) {
      const cached = scheduler.latestLimits.get(adapter.manifest.id) ?? [];
      for (const limit of cached) {
        allLimits.push(serializeLimit(limit));
      }
    }

    return { limits: allLimits };
  });

  // ------------------------------------------------------------------
  // GET /api/sessions
  // ------------------------------------------------------------------
  server.get(
    "/api/sessions",
    async (
      request: FastifyRequest<{
        Querystring: {
          provider?: string;
          limit?: string;
          offset?: string;
        };
      }>,
    ) => {
      const provider = request.query.provider;
      const limit = Math.min(Number(request.query.limit) || 50, 200);
      const offset = Math.max(Number(request.query.offset) || 0, 0);

      const allSessions = ledger.getSessions({
        providerId: provider,
      });
      const visibleSessions = sortSessionsForList(
        filterDisplaySessions(allSessions),
      );

      const page = visibleSessions.slice(offset, offset + limit);
      const now = Date.now();

      return {
        sessions: page.map((s) => ({
          id: s.id,
          title: s.title || "Untitled",
          provider: s.provider_id,
          model: s.model || "Unknown model",
          project: s.cwd || "Unknown workspace",
          tokensIn: s.token_input,
          tokensOut: s.token_output,
          cacheRead: s.token_cache_read,
          cacheWrite: s.token_cache_creation,
          cost: s.estimated_cost,
          startedAt: new Date(s.started_at).toISOString(),
          duration: s.ended_at ? Math.round((s.ended_at - s.started_at) / 1000) : Math.round((now - s.started_at) / 1000),
          active: s.status === "active",
        })),
        total: visibleSessions.length,
        limit,
        offset,
      };
    },
  );

  // ------------------------------------------------------------------
  // GET /api/sessions/:id
  // ------------------------------------------------------------------
  server.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (request, reply) => {
      const session = ledger.getSession(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: "session not found" });
      }

      const events = ledger.getEventsBySession(request.params.id);
      const now = Date.now();

      // Build messages and tool calls from events
      const messages: Array<{
        id: string;
        role: string;
        content: string;
        toolCalls?: Array<{ id: string; name: string; input: string; output: string | null; startedAt: string; durationMs: number }>;
        tokensIn?: number;
        tokensOut?: number;
        timestamp: string;
      }> = [];
      const tools: Array<{ id: string; name: string; input: string; output: string | null; startedAt: string; durationMs: number }> = [];
      let lastAssistantMessage:
        | (typeof messages)[number]
        | undefined;

      for (const evt of events) {
        const d = evt.data as Record<string, unknown>;
        if (evt.type === "prompt_sent") {
          messages.push({
            id: evt.id,
            role: "user",
            content: stringifyConversationContent(d.content),
            timestamp: new Date(evt.timestamp).toISOString(),
          });
        } else if (evt.type === "response_received") {
          const usage = d.usage as { inputTokens?: number; outputTokens?: number } | undefined;
          const assistantMessage = {
            id: evt.id,
            role: "assistant",
            content: stringifyConversationContent(d.content),
            tokensIn: usage?.inputTokens,
            tokensOut: usage?.outputTokens,
            timestamp: new Date(evt.timestamp).toISOString(),
          };
          messages.push(assistantMessage);
          lastAssistantMessage = assistantMessage;
        } else if (evt.type === "tool_call_started") {
          const tc = {
            id: evt.id,
            name: String(d.toolName ?? "unknown"),
            input: stringifyStructuredValue(d.input ?? d.arguments ?? ""),
            output: null,
            startedAt: new Date(evt.timestamp).toISOString(),
            durationMs: readNumber(d.durationMs) ?? 0,
          };
          tools.push(tc);
          if (lastAssistantMessage) {
            lastAssistantMessage.toolCalls = [
              ...(lastAssistantMessage.toolCalls ?? []),
              tc,
            ];
          }
        } else if (evt.type === "tool_call_finished") {
          const match = [...tools]
            .reverse()
            .find(
              (tool) =>
                tool.name === String(d.toolName ?? "unknown") &&
                tool.output == null,
            );

          const output = stringifyStructuredValue(d.output ?? "");
          if (match) {
            match.output = output || null;
            match.durationMs = readNumber(d.durationMs) ?? match.durationMs;
          } else {
            tools.push({
              id: evt.id,
              name: String(d.toolName ?? "unknown"),
              input: "",
              output: output || null,
              startedAt: new Date(evt.timestamp).toISOString(),
              durationMs: readNumber(d.durationMs) ?? 0,
            });
          }
        }
      }

      return {
        id: session.id,
        title: session.title || "Untitled",
        provider: session.provider_id,
        model: session.model || "Unknown model",
        project: session.cwd || "Unknown workspace",
        tokensIn: session.token_input,
        tokensOut: session.token_output,
        cacheRead: session.token_cache_read,
        cacheWrite: session.token_cache_creation,
        cost: session.estimated_cost,
        startedAt: new Date(session.started_at).toISOString(),
        duration: session.ended_at ? Math.round((session.ended_at - session.started_at) / 1000) : Math.round((now - session.started_at) / 1000),
        active: session.status === "active",
        messages,
        tools,
        tokenBreakdown: {
          input: session.token_input,
          output: session.token_output,
          cacheRead: session.token_cache_read,
          cacheWrite: session.token_cache_creation,
        },
      };
    },
  );

  // ------------------------------------------------------------------
  // GET /api/sessions/:id/timeline
  // ------------------------------------------------------------------
  server.get<{ Params: { id: string } }>(
    "/api/sessions/:id/timeline",
    async (request, reply) => {
      const session = ledger.getSession(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: "session not found" });
      }

      const events = ledger.getEventsBySession(request.params.id);
      const timeline = buildTimeline(events);

      return { sessionId: request.params.id, timeline };
    },
  );

  // ------------------------------------------------------------------
  // GET /api/insights (placeholder)
  // ------------------------------------------------------------------
  server.get("/api/insights", async () => {
    return {
      findings: [],
      generatedAt: Date.now(),
      message: "Hygiene insights not yet implemented.",
    };
  });

  // ------------------------------------------------------------------
  // GET /api/events (SSE stream)
  // ------------------------------------------------------------------
  server.get("/api/events", (request, reply) => {
    const clientId = nextClientId++;

    void reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send an initial comment to confirm the connection.
    reply.raw.write(": connected\n\n");

    const client: SseClient = {
      id: clientId,
      write: (chunk: string) => reply.raw.write(chunk),
      close: () => {
        sseClients.delete(client);
        reply.raw.end();
      },
    };

    sseClients.add(client);

    request.raw.on("close", () => {
      sseClients.delete(client);
    });
  });

  server.get("/", async (_request, reply) => {
    return serveUiAsset("index.html", reply, uiDistDir);
  });

  server.get<{ Params: { "*": string } }>("/*", async (request, reply) => {
    const path = request.params["*"];
    if (path.startsWith("api/")) {
      return reply.status(404).send({ error: "not found" });
    }

    return serveUiAsset(path, reply, uiDistDir);
  });

  // ------------------------------------------------------------------
  // Handle
  // ------------------------------------------------------------------

  return {
    async start() {
      await server.listen({ host, port });
      return { host, port };
    },
    async stop() {
      // Close all SSE connections.
      for (const client of sseClients) {
        try {
          client.close();
        } catch { /* ignore */ }
      }
      sseClients.clear();
      await server.close();
    },
    instance: server,
    broadcast: broadcastSse,
  };
}

function serveUiAsset(
  path: string,
  reply: FastifyReply,
  uiDistDir: URL,
) {
  const normalized = path.replace(/^\/+/, "");
  const targetUrl = new URL(normalized || "index.html", uiDistDir);

  if (normalized && existsSync(targetUrl) && statSync(targetUrl).isFile()) {
    reply.type(contentTypeFor(targetUrl.pathname));
    return reply.send(readFileSync(targetUrl));
  }

  const indexUrl = new URL("index.html", uiDistDir);
  if (existsSync(indexUrl)) {
    reply.type("text/html; charset=utf-8");
    return reply.send(readFileSync(indexUrl));
  }

  return reply.status(503).send({
    error: "ui not built",
    detail: "Run pnpm build to generate the dashboard assets.",
  });
}

function filterDisplaySessions(sessions: SessionRow[]): SessionRow[] {
  const meaningful = sessions.filter((session) => !isLowSignalSession(session));
  return meaningful.length > 0 ? meaningful : sessions;
}

function sortSessionsForList(sessions: SessionRow[]): SessionRow[] {
  return [...sessions].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") {
      return -1;
    }
    if (b.status === "active" && a.status !== "active") {
      return 1;
    }

    return b.updated_at - a.updated_at;
  });
}

function buildRecentSessions(sessions: SessionRow[], limit: number): SessionRow[] {
  const grouped = new Map<string, SessionRow[]>();

  for (const session of sessions) {
    const list = grouped.get(session.provider_id) ?? [];
    list.push(session);
    grouped.set(session.provider_id, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => {
      if (a.status === "active" && b.status !== "active") {
        return -1;
      }
      if (b.status === "active" && a.status !== "active") {
        return 1;
      }

      const signalDelta = sessionSignalScore(b) - sessionSignalScore(a);
      if (signalDelta !== 0) {
        return signalDelta;
      }

      return b.updated_at - a.updated_at;
    });
  }

  const providerOrder = [...grouped.keys()].sort();
  const recent: SessionRow[] = [];
  let index = 0;

  while (recent.length < limit && providerOrder.length > 0) {
    let addedThisPass = false;

    for (const providerId of providerOrder) {
      const list = grouped.get(providerId) ?? [];
      const session = list[index];
      if (session) {
        recent.push(session);
        addedThisPass = true;
        if (recent.length >= limit) {
          break;
        }
      }
    }

    if (!addedThisPass) {
      break;
    }

    index += 1;
  }

  return recent;
}

function isLowSignalSession(session: SessionRow): boolean {
  const hasActivity =
    session.turn_count > 0 ||
    session.tool_call_count > 0 ||
    session.token_input > 0 ||
    session.token_output > 0 ||
    session.token_cache_read > 0 ||
    session.token_cache_creation > 0;
  const hasMetadata =
    Boolean(session.model) ||
    Boolean(session.cwd) ||
    (Boolean(session.title) && session.title !== "Untitled");

  return session.status !== "active" && !hasActivity && !hasMetadata;
}

function sessionSignalScore(session: SessionRow): number {
  return (
    (session.status === "active" ? 10_000 : 0) +
    Math.min(session.turn_count, 50) * 250 +
    Math.min(session.tool_call_count, 50) * 150 +
    Math.min(session.token_input + session.token_output, 200_000) +
    Math.min(session.token_cache_read + session.token_cache_creation, 200_000) +
    (session.title && session.title !== "Untitled" ? 500 : 0) +
    (session.model ? 250 : 0) +
    (session.cwd ? 250 : 0)
  );
}

function contentTypeFor(pathname: string): string {
  switch (extname(pathname)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

// ---------------------------------------------------------------------------
// Timeline builder
// ---------------------------------------------------------------------------

interface TimelineEntry {
  turn: number;
  timestamp: number;
  type: string;
  summary: string;
  data: Record<string, unknown>;
}

function buildTimeline(events: NormalizedEvent[]): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  let turnCounter = 0;

  for (const evt of events) {
    if (evt.type === "prompt_sent") {
      turnCounter++;
    }

    timeline.push({
      turn: turnCounter,
      timestamp: evt.timestamp,
      type: evt.type,
      summary: summarizeEvent(evt),
      data: evt.data,
    });
  }

  return timeline;
}

function summarizeEvent(evt: NormalizedEvent): string {
  const d = evt.data as Record<string, unknown>;

  switch (evt.type) {
    case "session_started":
      return `Session started${d.model ? ` (model: ${d.model})` : ""}`;
    case "session_ended":
      return "Session ended";
    case "prompt_sent":
      return truncate(String(d.content ?? ""), 120);
    case "response_received":
      return truncate(String(d.content ?? ""), 120);
    case "tool_call_started":
      return `Tool: ${d.toolName ?? "unknown"}`;
    case "tool_call_finished":
      return `Tool finished: ${d.toolName ?? "unknown"}`;
    case "usage_snapshot":
      return `Tokens in=${d.inputTokens ?? 0} out=${d.outputTokens ?? 0}`;
    case "limit_snapshot":
      return `Limit ${d.limitId ?? "?"}: ${d.usedPercent ?? "?"}%`;
    case "error_raised":
      return `Error: ${truncate(String(d.message ?? d.error ?? ""), 100)}`;
    default:
      return evt.type;
  }
}

function serializeLimit(limit: LimitSnapshot) {
  return {
    provider: limit.providerId,
    tier: limit.limitId,
    requestsUsed: limit.requestsUsed ?? 0,
    requestsLimit: limit.requestsLimit ?? 0,
    tokensUsed: limit.tokensUsed ?? 0,
    tokensLimit: limit.tokensLimit ?? 0,
    resetsAt: new Date(limit.resetsAt).toISOString(),
    pressurePercent: limit.usedPercent,
    windowMinutes: limit.windowMinutes,
    planType: limit.planType,
    serviceTier: limit.serviceTier,
    telemetryMode: limit.telemetryMode,
    description: limit.description,
  };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function stringifyConversationContent(value: unknown): string {
  const extracted = extractTextContent(value).trim();
  if (extracted) {
    return extracted;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return stringifyStructuredValue(value);
}

function extractTextContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => extractTextContent(entry))
      .filter((entry) => entry.length > 0)
      .join("\n\n");
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (typeof record.content === "string") {
      return record.content;
    }
    if (record.content) {
      return extractTextContent(record.content);
    }
  }

  return "";
}

function stringifyStructuredValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
