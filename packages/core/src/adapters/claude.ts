import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import type { Adapter } from "./types.js";
import type { AdapterManifest, DetectionResult, HealthResult, ActiveSession, LimitSnapshot } from "../schemas/providers.js";
import type { NormalizedEvent } from "../schemas/events.js";
import { JsonlReader } from "../parsers/jsonl.js";
import { createEvent } from "../events/ledger.js";

const DEFAULT_CLAUDE_DIR = join(homedir(), ".claude");
const OBSERVED_CLAUDE_WINDOW_MINUTES = 300;
const OBSERVED_CLAUDE_SCAN_DAYS = 7;

const manifest: AdapterManifest = {
  id: "claude",
  name: "Claude Code",
  captureModes: ["passive", "import"],
  eventTypes: [
    "session_started", "session_ended",
    "prompt_sent", "response_received",
    "tool_call_started", "tool_call_finished",
    "usage_snapshot",
  ],
  dataLocations: [DEFAULT_CLAUDE_DIR],
  version: "1.0.0",
};

export class ClaudeAdapter implements Adapter {
  readonly manifest = manifest;
  private jsonlReader = new JsonlReader();
  private readonly claudeDir: string;
  private readonly sessionsDir: string;
  private readonly projectsDir: string;
  private readonly settingsPath: string;
  private readonly historyPath: string;
  private readonly now: () => number;

  constructor(opts: { claudeDir?: string; now?: () => number } = {}) {
    this.claudeDir = opts.claudeDir ?? DEFAULT_CLAUDE_DIR;
    this.sessionsDir = join(this.claudeDir, "sessions");
    this.projectsDir = join(this.claudeDir, "projects");
    this.settingsPath = join(this.claudeDir, "settings.json");
    this.historyPath = join(this.claudeDir, "history.jsonl");
    this.now = opts.now ?? (() => Date.now());
  }

  async detect(): Promise<DetectionResult> {
    const dataExists = existsSync(this.claudeDir);
    let version: string | undefined;

    try {
      version = execSync("claude --version 2>/dev/null", { encoding: "utf-8" }).trim();
    } catch {
      // CLI not found
    }

    return {
      installed: dataExists || !!version,
      version,
      dataPath: dataExists ? this.claudeDir : undefined,
    };
  }

  async getHealth(): Promise<HealthResult> {
    const detection = await this.detect();
    if (!detection.installed) {
      return { status: "error", details: "Claude Code not detected" };
    }

    const hasProjects = existsSync(this.projectsDir);
    const hasSessions = existsSync(this.sessionsDir);
    const hasHistory = existsSync(this.historyPath);

    if (hasProjects && hasHistory) {
      return { status: "ok", details: "Claude Code data available" };
    }

    if (hasSessions) {
      return { status: "degraded", details: "Limited data available (no project conversations found)" };
    }

    return { status: "degraded", details: "Claude Code installed but no session data found" };
  }

  async getActiveSessions(): Promise<ActiveSession[]> {
    if (!existsSync(this.sessionsDir)) return [];

    const sessions: ActiveSession[] = [];
    const files = readdirSync(this.sessionsDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const content = readFileSync(join(this.sessionsDir, file), "utf-8");
        const data = JSON.parse(content) as {
          pid: number;
          sessionId: string;
          cwd: string;
          startedAt: number;
        };

        // Check if the process is still running
        try {
          process.kill(data.pid, 0);
          sessions.push({
            sessionId: data.sessionId,
            pid: data.pid,
            cwd: data.cwd,
            startedAt: data.startedAt,
          });
        } catch {
          // Process not running, skip
        }
      } catch {
        // Skip malformed files
      }
    }

    return sessions;
  }

  async ingestEvents(since: number): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = [];

    if (!existsSync(this.projectsDir)) return events;

    // Scan all project directories for conversation JSONL files
    const projectDirs = readdirSync(this.projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(this.projectsDir, d.name));

    for (const projectDir of projectDirs) {
      const jsonlFiles = readdirSync(projectDir).filter((f) =>
        f.endsWith(".jsonl"),
      );

      for (const jsonlFile of jsonlFiles) {
        const filePath = join(projectDir, jsonlFile);
        const newLines = this.jsonlReader.readNewLines<ClaudeJsonlEntry>(filePath);

        for (const entry of newLines) {
          if (entry.timestamp) {
            const ts = new Date(entry.timestamp).getTime();
            if (ts <= since) continue;
          }

          const parsed = this.parseClaudeEntry(entry, filePath, jsonlFile);
          events.push(...parsed);
        }
      }
    }

    return events;
  }

  async getLimits(): Promise<LimitSnapshot[]> {
    const now = this.now();
    const usageEntries = this.readRecentUsageEntries(
      now - OBSERVED_CLAUDE_SCAN_DAYS * 24 * 60 * 60 * 1000,
    );

    if (usageEntries.length === 0) {
      return [];
    }

    const windowMs = OBSERVED_CLAUDE_WINDOW_MINUTES * 60_000;
    const latestServiceTier = usageEntries
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)[0]
      ?.serviceTier;
    const inWindow = usageEntries.filter((entry) => entry.timestamp >= now - windowMs);
    const oldestActiveTimestamp = inWindow.length > 0
      ? Math.min(...inWindow.map((entry) => entry.timestamp))
      : now;

    return [
      {
        providerId: "claude",
        limitId: "5h window",
        windowMinutes: OBSERVED_CLAUDE_WINDOW_MINUTES,
        resetsAt: oldestActiveTimestamp + windowMs,
        serviceTier: latestServiceTier,
        requestsUsed: inWindow.length,
        requestsLimit: 0,
        tokensUsed: inWindow.reduce(
          (sum, entry) =>
            sum
            + entry.inputTokens
            + entry.outputTokens
            + entry.cacheReadTokens
            + entry.cacheCreationTokens,
          0,
        ),
        tokensLimit: 0,
        telemetryMode: "observed",
        description: "Observed from local Claude Code logs. Remaining subscription headroom is not exposed locally.",
        capturedAt: now,
      },
    ];
  }

  /** Restore JSONL reader offsets */
  restoreOffsets(offsets: Record<string, number>): void {
    this.jsonlReader.importOffsets(offsets);
  }

  /** Export JSONL reader offsets for persistence */
  exportOffsets(): Record<string, number> {
    return this.jsonlReader.exportOffsets();
  }

  private readRecentUsageEntries(scanSince: number): ClaudeUsageEntry[] {
    if (!existsSync(this.projectsDir)) {
      return [];
    }

    const jsonlFiles: Array<{ path: string; mtimeMs: number }> = [];

    for (const projectDir of readdirSync(this.projectsDir, { withFileTypes: true })) {
      if (!projectDir.isDirectory()) {
        continue;
      }

      const dirPath = join(this.projectsDir, projectDir.name);
      for (const file of readdirSync(dirPath)) {
        if (!file.endsWith(".jsonl")) {
          continue;
        }

        const filePath = join(dirPath, file);
        try {
          jsonlFiles.push({
            path: filePath,
            mtimeMs: statSync(filePath).mtimeMs,
          });
        } catch {
          // Skip unreadable files.
        }
      }
    }

    const usageByRequest = new Map<string, ClaudeUsageEntry>();

    for (const file of jsonlFiles.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 48)) {
      const entries = JsonlReader.readAll<ClaudeJsonlEntry>(file.path);

      for (const entry of entries) {
        const usage = entry.message?.usage;
        if (entry.type !== "assistant" || entry.message?.role !== "assistant" || !usage) {
          continue;
        }

        const timestamp = new Date(entry.timestamp).getTime();
        if (!Number.isFinite(timestamp) || timestamp < scanSince) {
          continue;
        }

        const requestKey =
          entry.requestId
          ?? entry.message.id
          ?? entry.uuid
          ?? `${entry.sessionId ?? file.path}:${timestamp}`;
        const current = usageByRequest.get(requestKey);
        const next: ClaudeUsageEntry = {
          timestamp: current ? Math.max(current.timestamp, timestamp) : timestamp,
          serviceTier: usage.service_tier ?? current?.serviceTier,
          inputTokens: Math.max(current?.inputTokens ?? 0, usage.input_tokens ?? 0),
          outputTokens: Math.max(current?.outputTokens ?? 0, usage.output_tokens ?? 0),
          cacheReadTokens: Math.max(current?.cacheReadTokens ?? 0, usage.cache_read_input_tokens ?? 0),
          cacheCreationTokens: Math.max(current?.cacheCreationTokens ?? 0, usage.cache_creation_input_tokens ?? 0),
        };

        usageByRequest.set(requestKey, next);
      }
    }

    return [...usageByRequest.values()];
  }

  private parseClaudeEntry(
    entry: ClaudeJsonlEntry,
    filePath: string,
    fileName: string,
  ): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];
    const sessionId = entry.sessionId ?? fileName.replace(".jsonl", "");
    const rawRefBase = `${filePath}:${entry.uuid ?? entry.parentUuid ?? entry.timestamp}`;

    if (entry.type === "user" && entry.message?.role === "user") {
      const content = typeof entry.message.content === "string"
        ? entry.message.content
        : JSON.stringify(entry.message.content);

      events.push(
        createEvent({
          type: "prompt_sent",
          timestamp: new Date(entry.timestamp).getTime(),
          providerId: "claude",
          sessionId,
          rawRef: `${rawRefBase}:prompt`,
          data: {
            content: content.slice(0, 500), // Truncate for storage
            permissionMode: entry.permissionMode,
            cwd: entry.cwd,
            gitBranch: entry.gitBranch,
          },
        }),
      );
    }

    if (entry.type === "assistant" && entry.message?.role === "assistant") {
      const msg = entry.message;
      const hasThinking = msg.content?.some?.((c: { type: string }) => c.type === "thinking") ?? false;
      const hasToolUse = msg.content?.some?.((c: { type: string }) => c.type === "tool_use") ?? false;
      const textContent = msg.content
        ?.filter?.((c: { type: string }) => c.type === "text")
        ?.map?.((c: { text?: string }) => c.text ?? "")
        ?.join?.("") ?? "";

      events.push(
        createEvent({
          type: "response_received",
          timestamp: new Date(entry.timestamp).getTime(),
          providerId: "claude",
          sessionId,
          rawRef: `${rawRefBase}:response`,
          data: {
            model: msg.model,
            content: textContent.slice(0, 500),
            hasThinking,
            hasToolUse,
            usage: msg.usage
              ? {
                  inputTokens: msg.usage.input_tokens ?? 0,
                  outputTokens: msg.usage.output_tokens ?? 0,
                  cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
                  cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
                }
              : undefined,
          },
        }),
      );

      // Emit usage snapshot if token data available
      if (msg.usage) {
        events.push(
          createEvent({
            type: "usage_snapshot",
            timestamp: new Date(entry.timestamp).getTime(),
            providerId: "claude",
            sessionId,
            rawRef: `${rawRefBase}:usage`,
            data: {
              inputTokens: msg.usage.input_tokens ?? 0,
              outputTokens: msg.usage.output_tokens ?? 0,
              cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
              cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
              model: msg.model,
            },
          }),
        );
      }

      // Emit tool call events
      if (hasToolUse && msg.content) {
        for (const block of msg.content) {
          if (block.type === "tool_use") {
            events.push(
              createEvent({
                type: "tool_call_started",
                timestamp: new Date(entry.timestamp).getTime(),
                providerId: "claude",
                sessionId,
                rawRef: `${rawRefBase}:tool:${block.name}`,
                data: {
                  toolName: block.name,
                  input: block.input,
                },
              }),
            );
          }
        }
      }
    }

    return events;
  }
}

/** Raw Claude Code JSONL entry shape (partial) */
interface ClaudeJsonlEntry {
  type?: string;
  timestamp: string;
  requestId?: string;
  sessionId?: string;
  message?: {
    id?: string;
    role: string;
    model?: string;
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: unknown;
      thinking?: string;
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      service_tier?: string;
    };
  };
  permissionMode?: string;
  cwd?: string;
  gitBranch?: string;
  uuid?: string;
  parentUuid?: string;
}

interface ClaudeUsageEntry {
  timestamp: number;
  serviceTier?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}
