import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import type { Adapter } from "./types.js";
import type { AdapterManifest, DetectionResult, HealthResult, ActiveSession, LimitSnapshot } from "../schemas/providers.js";
import type { NormalizedEvent } from "../schemas/events.js";
import { ReadOnlySqlite } from "../parsers/sqlite.js";
import { JsonlReader } from "../parsers/jsonl.js";
import { createEvent } from "../events/ledger.js";

const CODEX_DIR = join(homedir(), ".codex");
const STATE_DB_PATH = join(CODEX_DIR, "state_5.sqlite");
const CONFIG_PATH = join(CODEX_DIR, "config.toml");
const SESSION_INDEX_PATH = join(CODEX_DIR, "session_index.jsonl");
const SESSIONS_DIR = join(CODEX_DIR, "sessions");

const manifest: AdapterManifest = {
  id: "codex",
  name: "Codex",
  captureModes: ["passive", "import"],
  eventTypes: [
    "session_started", "session_ended",
    "prompt_sent", "response_received",
    "tool_call_started", "tool_call_finished",
    "usage_snapshot", "limit_snapshot",
  ],
  dataLocations: [CODEX_DIR],
  version: "1.0.0",
};

interface CodexThread {
  id: string;
  title: string;
  model: string | null;
  model_provider: string;
  tokens_used: number;
  cwd: string;
  git_sha: string | null;
  git_branch: string | null;
  created_at: number;
  updated_at: number;
  approval_mode: string;
  sandbox_policy: string;
  cli_version: string;
  first_user_message: string;
  agent_nickname: string | null;
  agent_role: string | null;
  reasoning_effort: string | null;
  archived: number;
}

export class CodexAdapter implements Adapter {
  readonly manifest = manifest;
  private stateDb: ReadOnlySqlite | null = null;
  private jsonlReader = new JsonlReader();
  private lastThreadWatermark = 0;

  async detect(): Promise<DetectionResult> {
    const dataExists = existsSync(CODEX_DIR);
    let version: string | undefined;

    try {
      version = execSync("codex --version 2>/dev/null", { encoding: "utf-8" }).trim();
    } catch {
      // CLI not found
    }

    return {
      installed: dataExists || !!version,
      version,
      dataPath: dataExists ? CODEX_DIR : undefined,
    };
  }

  async getHealth(): Promise<HealthResult> {
    const detection = await this.detect();
    if (!detection.installed) {
      return { status: "error", details: "Codex not detected" };
    }

    const hasStateDb = existsSync(STATE_DB_PATH);
    const hasSessions = existsSync(SESSIONS_DIR);

    if (hasStateDb && hasSessions) {
      return { status: "ok", details: "Codex data available (SQLite + session logs)" };
    }

    if (hasStateDb) {
      return { status: "degraded", details: "Codex SQLite available but no session logs found" };
    }

    return { status: "degraded", details: "Codex installed but no structured data found" };
  }

  async getActiveSessions(): Promise<ActiveSession[]> {
    // Codex doesn't store PID files like Claude Code.
    // We detect "active" sessions by checking for recent thread updates.
    const db = this.getStateDb();
    if (!db) return [];

    try {
      const fiveMinAgo = Date.now() / 1000 - 300;
      const threads = db.query<CodexThread>(
        "SELECT * FROM threads WHERE updated_at > ? AND archived = 0 ORDER BY updated_at DESC LIMIT 5",
        [fiveMinAgo],
      );

      return threads.map((t) => ({
        sessionId: t.id,
        cwd: t.cwd,
        startedAt: t.created_at * 1000,
        model: t.model ?? undefined,
      }));
    } catch {
      return [];
    }
  }

  async ingestEvents(since: number): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = [];

    // 1. Ingest from SQLite threads table
    const db = this.getStateDb();
    if (db) {
      try {
        const sinceSeconds = since / 1000;
        const threads = db.query<CodexThread>(
          "SELECT * FROM threads WHERE updated_at > ? ORDER BY updated_at ASC",
          [sinceSeconds > 0 ? sinceSeconds : 0],
        );

        for (const thread of threads) {
          events.push(
            createEvent({
              type: "session_started",
              timestamp: thread.created_at * 1000,
              providerId: "codex",
              sessionId: thread.id,
              data: {
                title: thread.title,
                model: thread.model,
                cwd: thread.cwd,
                gitBranch: thread.git_branch,
                tokensUsed: thread.tokens_used,
                permissionMode: thread.approval_mode,
                sandboxPolicy: thread.sandbox_policy,
                cliVersion: thread.cli_version,
                agentNickname: thread.agent_nickname,
                agentRole: thread.agent_role,
                reasoningEffort: thread.reasoning_effort,
              },
            }),
          );

          // Emit usage snapshot for total thread tokens
          if (thread.tokens_used > 0) {
            events.push(
              createEvent({
                type: "usage_snapshot",
                timestamp: thread.updated_at * 1000,
                providerId: "codex",
                sessionId: thread.id,
                data: {
                  inputTokens: thread.tokens_used, // Codex only gives total
                  outputTokens: 0,
                  model: thread.model,
                  usageMode: "cumulative",
                },
              }),
            );
          }
        }
      } catch {
        // SQLite read failed, continue with other sources
      }
    }

    // 2. Ingest from rollout JSONL files for detailed events
    events.push(...this.ingestRolloutFiles(since));

    return events;
  }

  async getLimits(): Promise<LimitSnapshot[]> {
    const limits: LimitSnapshot[] = [];

    // Scan recent rollout files for token_count events with rate_limits
    if (!existsSync(SESSIONS_DIR)) return limits;

    const today = new Date();
    const datePath = join(
      SESSIONS_DIR,
      today.getFullYear().toString(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    );

    if (!existsSync(datePath)) return limits;

    const rolloutFiles = readdirSync(datePath)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse()
      .slice(0, 5); // Check last 5 sessions for limit data

    for (const file of rolloutFiles) {
      const filePath = join(datePath, file);
      const lines = JsonlReader.readAll<CodexRolloutEntry>(filePath);

      for (const line of lines) {
        if (
          line.type === "event_msg" &&
          line.payload?.type === "token_count" &&
          line.payload?.rate_limits
        ) {
          const rl = line.payload.rate_limits;
          if (rl.primary) {
            limits.push({
              providerId: "codex",
              limitId: `${rl.limit_id ?? "codex"}-session`,
              usedPercent: rl.primary.used_percent,
              windowMinutes: rl.primary.window_minutes,
              resetsAt: rl.primary.resets_at * 1000,
              planType: rl.plan_type,
              capturedAt: new Date(line.timestamp).getTime(),
            });
          }
          if (rl.secondary) {
            limits.push({
              providerId: "codex",
              limitId: `${rl.limit_id ?? "codex"}-weekly`,
              usedPercent: rl.secondary.used_percent,
              windowMinutes: rl.secondary.window_minutes,
              resetsAt: rl.secondary.resets_at * 1000,
              planType: rl.plan_type,
              capturedAt: new Date(line.timestamp).getTime(),
            });
          }
          // Return the most recent limit data
          return limits;
        }
      }
    }

    return limits;
  }

  /** Restore state */
  restoreOffsets(offsets: Record<string, number>): void {
    this.jsonlReader.importOffsets(offsets);
  }

  exportOffsets(): Record<string, number> {
    return this.jsonlReader.exportOffsets();
  }

  private getStateDb(): ReadOnlySqlite | null {
    if (!existsSync(STATE_DB_PATH)) return null;

    if (!this.stateDb) {
      this.stateDb = new ReadOnlySqlite(STATE_DB_PATH);
    }

    try {
      this.stateDb.open();
      return this.stateDb;
    } catch {
      return null;
    }
  }

  private ingestRolloutFiles(since: number): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];
    if (!existsSync(SESSIONS_DIR)) return events;

    // Scan date-organized session directories
    try {
      const years = readdirSync(SESSIONS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const year of years) {
        const yearPath = join(SESSIONS_DIR, year);
        const months = readdirSync(yearPath, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        for (const month of months) {
          const monthPath = join(yearPath, month);
          const days = readdirSync(monthPath, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);

          for (const day of days) {
            const dayPath = join(monthPath, day);
            const rolloutFiles = readdirSync(dayPath).filter((f) =>
              f.endsWith(".jsonl"),
            );

            for (const file of rolloutFiles) {
              const filePath = join(dayPath, file);
              const newLines =
                this.jsonlReader.readNewLines<CodexRolloutEntry>(filePath);

              for (const entry of newLines) {
                const ts = new Date(entry.timestamp).getTime();
                if (ts <= since) continue;

                events.push(...this.parseRolloutEntry(entry, filePath, file));
              }
            }
          }
        }
      }
    } catch {
      // Directory traversal failed
    }

    return events;
  }

  private parseRolloutEntry(
    entry: CodexRolloutEntry,
    filePath: string,
    fileName: string,
  ): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];
    const ts = new Date(entry.timestamp).getTime();
    const sessionId =
      entry.payload?.id ??
      fileName.replace(".jsonl", "").replace(/^rollout-/, "");
    const rawRefBase = `${filePath}:${entry.timestamp}:${entry.type}`;

    if (entry.type === "session_meta" && entry.payload) {
      events.push(
        createEvent({
          type: "session_started",
          timestamp: ts,
          providerId: "codex",
          sessionId,
          rawRef: `${rawRefBase}:session`,
          data: {
            cwd: entry.payload.cwd,
            cliVersion: entry.payload.cli_version,
            originator: entry.payload.originator,
            source: entry.payload.source,
          },
        }),
      );
    }

    if (entry.type === "response_item" && entry.payload) {
      if (entry.payload.type === "function_call") {
        events.push(
          createEvent({
            type: "tool_call_started",
            timestamp: ts,
            providerId: "codex",
            sessionId,
            rawRef: `${rawRefBase}:tool:${entry.payload.name ?? "unknown"}`,
            data: {
              toolName: entry.payload.name,
              input: entry.payload.arguments,
              arguments: entry.payload.arguments,
            },
          }),
        );
      }

      if (entry.payload.type === "message" && entry.payload.role === "assistant") {
        events.push(
          createEvent({
            type: "response_received",
            timestamp: ts,
            providerId: "codex",
            sessionId,
            rawRef: `${rawRefBase}:response`,
            data: {
              role: entry.payload.role,
              content: entry.payload.content,
            },
          }),
        );
      }
    }

    if (entry.type === "event_msg" && entry.payload) {
      if (entry.payload.type === "token_count" && entry.payload.rate_limits) {
        events.push(
          createEvent({
            type: "limit_snapshot",
            timestamp: ts,
            providerId: "codex",
            sessionId,
            rawRef: `${rawRefBase}:limits`,
            data: entry.payload.rate_limits,
          }),
        );
      }
    }

    return events;
  }
}

interface CodexRolloutEntry {
  timestamp: string;
  type: "session_meta" | "event_msg" | "response_item";
  payload?: {
    id?: string;
    type?: string;
    cwd?: string;
    cli_version?: string;
    originator?: string;
    source?: unknown;
    name?: string;
    arguments?: string;
    role?: string;
    content?: unknown;
    rate_limits?: {
      limit_id?: string;
      primary?: { used_percent: number; window_minutes: number; resets_at: number };
      secondary?: { used_percent: number; window_minutes: number; resets_at: number };
      plan_type?: string;
    };
  };
}
