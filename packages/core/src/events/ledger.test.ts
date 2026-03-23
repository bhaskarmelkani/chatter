import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { EventLedger, createEvent } from "./ledger.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function createTempLedger(): EventLedger {
  const dir = mkdtempSync(join(tmpdir(), "chatter-ledger-"));
  tempDirs.push(dir);
  return new EventLedger(join(dir, "events.sqlite"));
}

describe("EventLedger", () => {
  it("projects inserted events into a session summary without double-counting duplicates", () => {
    const ledger = createTempLedger();
    const prompt = createEvent({
      type: "prompt_sent",
      timestamp: 1_000,
      providerId: "claude",
      sessionId: "session-1",
      data: {
        content: "Investigate the auth timeout flow",
        cwd: "/repo/app",
        gitBranch: "main",
        permissionMode: "plan",
      },
      rawRef: "claude:file:prompt-1",
    });
    const response = createEvent({
      type: "response_received",
      timestamp: 2_000,
      providerId: "claude",
      sessionId: "session-1",
      data: {
        model: "claude-sonnet",
        content: "Here is the plan.",
      },
      rawRef: "claude:file:response-1",
    });
    const usage = createEvent({
      type: "usage_snapshot",
      timestamp: 2_000,
      providerId: "claude",
      sessionId: "session-1",
      data: {
        inputTokens: 120,
        outputTokens: 30,
        cacheReadTokens: 45,
        cacheCreationTokens: 10,
        model: "claude-sonnet",
      },
      rawRef: "claude:file:usage-1",
    });
    const tool = createEvent({
      type: "tool_call_started",
      timestamp: 2_500,
      providerId: "claude",
      sessionId: "session-1",
      data: {
        toolName: "Read",
      },
      rawRef: "claude:file:tool-1",
    });

    ledger.insertEvents([prompt, response, usage, tool]);
    ledger.insertEvents([prompt, response, usage, tool]);

    const session = ledger.getSession("session-1");
    expect(session).toBeDefined();
    expect(session?.title).toContain("Investigate the auth timeout flow");
    expect(session?.model).toBe("claude-sonnet");
    expect(session?.cwd).toBe("/repo/app");
    expect(session?.git_branch).toBe("main");
    expect(session?.permission_mode).toBe("plan");
    expect(session?.turn_count).toBe(1);
    expect(session?.tool_call_count).toBe(1);
    expect(session?.token_input).toBe(120);
    expect(session?.token_output).toBe(30);
    expect(session?.token_cache_read).toBe(45);
    expect(session?.token_cache_creation).toBe(10);
    expect(ledger.getEventsBySession("session-1")).toHaveLength(4);

    ledger.close();
  });

  it("stores ingest state for checkpointed adapters", () => {
    const ledger = createTempLedger();
    ledger.setIngestState("since:claude", "123");
    expect(ledger.getIngestState("since:claude")).toBe("123");
    ledger.close();
  });

  it("treats cumulative usage snapshots as totals and estimates missing cost", () => {
    const ledger = createTempLedger();

    ledger.insertEvents([
      createEvent({
        type: "session_started",
        timestamp: 1_000,
        providerId: "codex",
        sessionId: "session-2",
        data: {
          model: "gpt-4o-mini-2025-03-01",
          cwd: "/repo/app",
          permissionMode: "workspace-write",
        },
      }),
      createEvent({
        type: "usage_snapshot",
        timestamp: 2_000,
        providerId: "codex",
        sessionId: "session-2",
        data: {
          inputTokens: 1_000,
          outputTokens: 250,
          model: "gpt-4o-mini-2025-03-01",
          usageMode: "cumulative",
        },
      }),
      createEvent({
        type: "usage_snapshot",
        timestamp: 3_000,
        providerId: "codex",
        sessionId: "session-2",
        data: {
          inputTokens: 1_500,
          outputTokens: 400,
          model: "gpt-4o-mini-2025-03-01",
          usageMode: "cumulative",
        },
      }),
    ]);

    const session = ledger.getSession("session-2");
    expect(session).toBeDefined();
    expect(session?.permission_mode).toBe("workspace-write");
    expect(session?.token_input).toBe(1_500);
    expect(session?.token_output).toBe(400);
    expect(session?.estimated_cost).toBeGreaterThan(0);

    ledger.close();
  });

  it("can rebuild session projections from existing events", () => {
    const ledger = createTempLedger();

    ledger.insertEvents([
      createEvent({
        type: "prompt_sent",
        timestamp: 1_000,
        providerId: "codex",
        sessionId: "session-3",
        data: { content: "Summarize the rollout", cwd: "/repo/chatter" },
      }),
      createEvent({
        type: "usage_snapshot",
        timestamp: 2_000,
        providerId: "codex",
        sessionId: "session-3",
        data: {
          inputTokens: 2_000,
          outputTokens: 200,
          model: "gpt-5.4-mini",
          usageMode: "cumulative",
        },
      }),
    ]);

    ledger.upsertSession({
      id: "session-3",
      provider_id: "codex",
      title: "stale",
      model: "",
      cwd: "",
      git_branch: null,
      started_at: 0,
      ended_at: null,
      token_input: 0,
      token_output: 0,
      token_cache_read: 0,
      token_cache_creation: 0,
      estimated_cost: 0,
      turn_count: 0,
      tool_call_count: 0,
      status: "active",
      capture_fidelity: "partial",
      permission_mode: null,
      reasoning_effort: null,
      updated_at: 0,
    });

    ledger.rebuildSessions();

    const session = ledger.getSession("session-3");
    expect(session?.title).toContain("Summarize the rollout");
    expect(session?.token_input).toBe(2_000);
    expect(session?.estimated_cost).toBeGreaterThan(0);

    ledger.close();
  });
});
