import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Adapter } from "@chatter/core";
import { EventLedger, createEvent } from "@chatter/core";
import { createServer } from "./server.js";
import { Scheduler } from "./scheduler.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function createMockAdapter(
  overrides?: Partial<Adapter["manifest"]> & {
    health?: { status: "ok" | "degraded" | "error"; details: string };
    activeSessions?: Awaited<ReturnType<Adapter["getActiveSessions"]>>;
  },
): Adapter {
  const { health, activeSessions, ...manifestOverrides } = overrides ?? {};

  return {
    manifest: {
      id: manifestOverrides.id ?? "claude",
      name: manifestOverrides.name ?? "Claude Code",
      captureModes: ["passive"],
      eventTypes: ["prompt_sent", "response_received", "usage_snapshot"],
      dataLocations: ["/tmp/mock"],
      version: "test",
      ...manifestOverrides,
    },
    async detect() {
      return { installed: true, version: "1.2.3", dataPath: "/tmp/mock" };
    },
    async getHealth() {
      return health ?? ({ status: "ok", details: "healthy" } as const);
    },
    async ingestEvents() {
      return [];
    },
    async getLimits() {
      return [];
    },
    async getActiveSessions() {
      return activeSessions ?? [
        { sessionId: "session-1", cwd: "/repo/app", startedAt: 1_000 },
      ];
    },
  };
}

describe("createServer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves dashboard and session details from the ledger", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chatter-daemon-"));
    tempDirs.push(dir);
    const ledger = new EventLedger(join(dir, "events.sqlite"));

    ledger.insertEvents([
      createEvent({
        type: "prompt_sent",
        timestamp: 1_000,
        providerId: "claude",
        sessionId: "session-1",
        data: { content: "Summarize the current state", cwd: "/repo/app" },
        rawRef: "mock:prompt",
      }),
      createEvent({
        type: "response_received",
        timestamp: 2_000,
        providerId: "claude",
        sessionId: "session-1",
        data: { model: "claude-sonnet", content: "Current state summary." },
        rawRef: "mock:response",
      }),
      createEvent({
        type: "usage_snapshot",
        timestamp: 2_000,
        providerId: "claude",
        sessionId: "session-1",
        data: {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 5,
          cacheCreationTokens: 0,
          model: "claude-sonnet",
        },
        rawRef: "mock:usage",
      }),
    ]);

    const adapter = createMockAdapter();
    const scheduler = new Scheduler({ adapters: [adapter], ledger });
    scheduler.activeSessions.set("claude", [
      { sessionId: "session-1", cwd: "/repo/app", startedAt: 1_000 },
    ]);

    const server = createServer({
      adapters: [adapter],
      ledger,
      scheduler,
    });

    await server.instance.ready();

    const dashboardResponse = await server.instance.inject({
      method: "GET",
      url: "/api/dashboard",
    });
    expect(dashboardResponse.statusCode).toBe(200);
    expect(dashboardResponse.json().recentSessions).toHaveLength(1);

    const sessionResponse = await server.instance.inject({
      method: "GET",
      url: "/api/sessions/session-1",
    });
    expect(sessionResponse.statusCode).toBe(200);
    const body = sessionResponse.json();
    expect(body.id).toBe("session-1");
    expect(body.messages).toHaveLength(2);
    expect(body.tokenBreakdown.input).toBe(10);

    await server.stop();
    ledger.close();
  });

  it("reconstructs structured assistant content and tool traces", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chatter-daemon-"));
    tempDirs.push(dir);
    const ledger = new EventLedger(join(dir, "events.sqlite"));

    ledger.insertEvents([
      createEvent({
        type: "prompt_sent",
        timestamp: 1_000,
        providerId: "codex",
        sessionId: "session-2",
        data: { content: "Open the file", cwd: "/repo/app" },
        rawRef: "mock:prompt-2",
      }),
      createEvent({
        type: "response_received",
        timestamp: 2_000,
        providerId: "codex",
        sessionId: "session-2",
        data: {
          model: "gpt-4o-mini",
          content: [{ type: "output_text", text: "I inspected the file." }],
        },
        rawRef: "mock:response-2",
      }),
      createEvent({
        type: "tool_call_started",
        timestamp: 2_100,
        providerId: "codex",
        sessionId: "session-2",
        data: {
          toolName: "Read",
          arguments: "{\"filePath\":\"src/index.ts\"}",
        },
        rawRef: "mock:tool-start-2",
      }),
      createEvent({
        type: "tool_call_finished",
        timestamp: 2_200,
        providerId: "codex",
        sessionId: "session-2",
        data: {
          toolName: "Read",
          output: "file contents",
          durationMs: 100,
        },
        rawRef: "mock:tool-finish-2",
      }),
    ]);

    const adapter = createMockAdapter();
    const scheduler = new Scheduler({ adapters: [adapter], ledger });
    const server = createServer({
      adapters: [adapter],
      ledger,
      scheduler,
    });

    await server.instance.ready();

    const sessionResponse = await server.instance.inject({
      method: "GET",
      url: "/api/sessions/session-2",
    });
    expect(sessionResponse.statusCode).toBe(200);

    const body = sessionResponse.json();
    expect(body.messages[1].content).toContain("I inspected the file.");
    expect(body.messages[1].toolCalls).toHaveLength(1);
    expect(body.tools[0].input).toContain("filePath");
    expect(body.tools[0].output).toBe("file contents");
    expect(body.tools[0].durationMs).toBe(100);

    await server.stop();
    ledger.close();
  });

  it("normalizes observed limits for the API", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chatter-daemon-"));
    tempDirs.push(dir);
    const ledger = new EventLedger(join(dir, "events.sqlite"));

    const adapter = createMockAdapter();
    const scheduler = new Scheduler({ adapters: [adapter], ledger });
    scheduler.latestLimits.set("claude", [
      {
        providerId: "claude",
        limitId: "5h window",
        windowMinutes: 300,
        resetsAt: 10_000,
        requestsUsed: 4,
        tokensUsed: 1200,
        telemetryMode: "observed",
        serviceTier: "standard",
        description: "Observed from local Claude Code logs.",
        capturedAt: 9_000,
      },
    ]);

    const server = createServer({
      adapters: [adapter],
      ledger,
      scheduler,
    });

    await server.instance.ready();

    const response = await server.instance.inject({
      method: "GET",
      url: "/api/limits",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().limits).toEqual([
      {
        provider: "claude",
        tier: "5h window",
        requestsUsed: 4,
        requestsLimit: 0,
        tokensUsed: 1200,
        tokensLimit: 0,
        resetsAt: new Date(10_000).toISOString(),
        pressurePercent: undefined,
        windowMinutes: 300,
        planType: undefined,
        serviceTier: "standard",
        telemetryMode: "observed",
        description: "Observed from local Claude Code logs.",
      },
    ]);

    await server.stop();
    ledger.close();
  });

  it("returns rolling 24-hour analytics aggregates for the dashboard", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-23T13:30:00.000Z");
    vi.setSystemTime(now);

    const dir = mkdtempSync(join(tmpdir(), "chatter-daemon-"));
    tempDirs.push(dir);
    const ledger = new EventLedger(join(dir, "events.sqlite"));

    const previousDayWithin24h = now.getTime() - 23 * 60 * 60 * 1000;
    const currentDay = now.getTime() - 90 * 60 * 1000;
    const secondCurrentDay = now.getTime() - 45 * 60 * 1000;

    ledger.insertEvents([
      createEvent({
        type: "prompt_sent",
        timestamp: previousDayWithin24h,
        providerId: "codex",
        sessionId: "session-prev-day",
        data: { content: "Review telemetry", cwd: "/repo/alpha" },
        rawRef: "mock:prev:prompt",
      }),
      createEvent({
        type: "response_received",
        timestamp: previousDayWithin24h + 1_000,
        providerId: "codex",
        sessionId: "session-prev-day",
        data: { model: "gpt-4o-mini", content: "Done." },
        rawRef: "mock:prev:response",
      }),
      createEvent({
        type: "usage_snapshot",
        timestamp: previousDayWithin24h + 1_000,
        providerId: "codex",
        sessionId: "session-prev-day",
        data: {
          inputTokens: 200,
          outputTokens: 100,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          model: "gpt-4o-mini",
        },
        rawRef: "mock:prev:usage",
      }),
      createEvent({
        type: "prompt_sent",
        timestamp: currentDay,
        providerId: "claude",
        sessionId: "session-current-day",
        data: { content: "Summarize status", cwd: "/repo/beta" },
        rawRef: "mock:current:prompt",
      }),
      createEvent({
        type: "response_received",
        timestamp: currentDay + 1_000,
        providerId: "claude",
        sessionId: "session-current-day",
        data: { model: "claude-sonnet", content: "Status summary." },
        rawRef: "mock:current:response",
      }),
      createEvent({
        type: "usage_snapshot",
        timestamp: currentDay + 1_000,
        providerId: "claude",
        sessionId: "session-current-day",
        data: {
          inputTokens: 120,
          outputTokens: 80,
          cacheReadTokens: 20,
          cacheCreationTokens: 0,
          model: "claude-sonnet",
        },
        rawRef: "mock:current:usage",
      }),
      createEvent({
        type: "prompt_sent",
        timestamp: secondCurrentDay,
        providerId: "claude",
        sessionId: "session-current-day-2",
        data: { content: "Inspect workspace", cwd: "/repo/alpha" },
        rawRef: "mock:current-2:prompt",
      }),
      createEvent({
        type: "response_received",
        timestamp: secondCurrentDay + 1_000,
        providerId: "claude",
        sessionId: "session-current-day-2",
        data: { model: "claude-sonnet", content: "Workspace inspected." },
        rawRef: "mock:current-2:response",
      }),
      createEvent({
        type: "usage_snapshot",
        timestamp: secondCurrentDay + 1_000,
        providerId: "claude",
        sessionId: "session-current-day-2",
        data: {
          inputTokens: 50,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          model: "claude-sonnet",
        },
        rawRef: "mock:current-2:usage",
      }),
    ]);

    const claude = createMockAdapter({
      id: "claude",
      name: "Claude Code",
      activeSessions: [
        {
          sessionId: "session-current-day",
          cwd: "/repo/beta",
          startedAt: currentDay,
        },
      ],
    });
    const codex = createMockAdapter({
      id: "codex",
      name: "Codex",
      health: { status: "degraded", details: "latency spike" },
      activeSessions: [],
    });

    const scheduler = new Scheduler({ adapters: [claude, codex], ledger });
    scheduler.activeSessions.set("claude", [
      {
        sessionId: "session-current-day",
        cwd: "/repo/beta",
        startedAt: currentDay,
      },
    ]);
    scheduler.activeSessions.set("codex", []);
    scheduler.latestLimits.set("claude", [
      {
        providerId: "claude",
        limitId: "5h window",
        usedPercent: 88,
        windowMinutes: 300,
        resetsAt: now.getTime() + 60 * 60 * 1000,
        capturedAt: now.getTime(),
      },
    ]);

    const server = createServer({
      adapters: [claude, codex],
      ledger,
      scheduler,
    });

    await server.instance.ready();

    const response = await server.instance.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.sessionBuckets).toHaveLength(24);
    expect(
      body.sessionBuckets.some(
        (bucket: { sessions: number }) => bucket.sessions > 0,
      ),
    ).toBe(true);
    expect(
      body.sessionBuckets.some((bucket: { bucketStart: string; sessions: number }) => {
        const bucketTime = new Date(bucket.bucketStart).getTime();
        return (
          bucketTime <= previousDayWithin24h &&
          previousDayWithin24h < bucketTime + 60 * 60 * 1000 &&
          bucket.sessions > 0
        );
      }),
    ).toBe(true);

    expect(body.providerBreakdown).toEqual([
      expect.objectContaining({
        provider: "claude",
        status: "healthy",
        activeSessions: 1,
        sessions24h: 2,
        tokens24h: 300,
      }),
      expect.objectContaining({
        provider: "codex",
        status: "degraded",
        activeSessions: 0,
        sessions24h: 1,
        tokens24h: 300,
      }),
    ]);

    expect(body.workspaceRanking.slice(0, 2)).toEqual([
      expect.objectContaining({
        project: "/repo/alpha",
        sessions: 2,
        tokens: 400,
      }),
      expect.objectContaining({
        project: "/repo/beta",
        sessions: 1,
        tokens: 200,
      }),
    ]);
    expect(body.healthyCounts).toEqual({
      healthy: 1,
      degraded: 1,
      unreachable: 0,
    });
    expect(body.highPressureCount).toBe(1);

    await server.stop();
    ledger.close();
  });
});
