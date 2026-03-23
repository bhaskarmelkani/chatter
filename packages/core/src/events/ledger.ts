import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { NormalizedEvent, EventType } from "../schemas/events.js";
import { estimateCostUSD } from "../pricing.js";

/**
 * SQLite-backed event ledger for normalized agent events.
 * This is the single source of truth for all observed activity.
 */
export class EventLedger {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        turn_index INTEGER,
        data TEXT NOT NULL,
        raw_ref TEXT,
        ingested_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_session
        ON events(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_provider_time
        ON events(provider_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_events_type
        ON events(type, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp
        ON events(timestamp DESC);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        cwd TEXT NOT NULL DEFAULT '',
        git_branch TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        token_input INTEGER NOT NULL DEFAULT 0,
        token_output INTEGER NOT NULL DEFAULT 0,
        token_cache_read INTEGER NOT NULL DEFAULT 0,
        token_cache_creation INTEGER NOT NULL DEFAULT 0,
        estimated_cost REAL NOT NULL DEFAULT 0,
        turn_count INTEGER NOT NULL DEFAULT 0,
        tool_call_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        capture_fidelity TEXT NOT NULL DEFAULT 'partial',
        permission_mode TEXT,
        reasoning_effort TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_provider
        ON sessions(provider_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_status
        ON sessions(status);

      CREATE TABLE IF NOT EXISTS ingest_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /** Insert events in batch */
  insertEvents(events: NormalizedEvent[]): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO events (id, type, timestamp, provider_id, session_id, turn_index, data, raw_ref, ingested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((evts: NormalizedEvent[]) => {
      for (const evt of evts) {
        insert.run(
          evt.id,
          evt.type,
          evt.timestamp,
          evt.providerId,
          evt.sessionId,
          evt.turnIndex ?? null,
          JSON.stringify(evt.data),
          evt.rawRef ?? null,
          Date.now(),
        );
      }

      const sessionIds = [...new Set(evts.map((event) => event.sessionId))];
      if (sessionIds.length > 0) {
        this.projectSessions(sessionIds);
      }
    });

    tx(events);
  }

  /** Query events by session */
  getEventsBySession(sessionId: string): NormalizedEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC",
      )
      .all(sessionId) as EventRow[];
    return rows.map(rowToEvent);
  }

  /** Query events by type since a timestamp */
  getEventsByType(type: EventType, since: number = 0): NormalizedEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE type = ? AND timestamp > ? ORDER BY timestamp ASC",
      )
      .all(type, since) as EventRow[];
    return rows.map(rowToEvent);
  }

  /** Query recent events across all types */
  getRecentEvents(limit: number = 100): NormalizedEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as EventRow[];
    return rows.map(rowToEvent);
  }

  /** Upsert a session record */
  upsertSession(session: SessionRow): void {
    this.db
      .prepare(
        `INSERT INTO sessions (
        id, provider_id, title, model, cwd, git_branch,
        started_at, ended_at, token_input, token_output,
        token_cache_read, token_cache_creation, estimated_cost,
        turn_count, tool_call_count, status, capture_fidelity,
        permission_mode, reasoning_effort, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        model = excluded.model,
        cwd = excluded.cwd,
        git_branch = excluded.git_branch,
        ended_at = excluded.ended_at,
        token_input = excluded.token_input,
        token_output = excluded.token_output,
        token_cache_read = excluded.token_cache_read,
        token_cache_creation = excluded.token_cache_creation,
        estimated_cost = excluded.estimated_cost,
        turn_count = excluded.turn_count,
        tool_call_count = excluded.tool_call_count,
        status = excluded.status,
        capture_fidelity = excluded.capture_fidelity,
        permission_mode = excluded.permission_mode,
        reasoning_effort = excluded.reasoning_effort,
        updated_at = excluded.updated_at`,
      )
      .run(
        session.id,
        session.provider_id,
        session.title,
        session.model,
        session.cwd,
        session.git_branch ?? null,
        session.started_at,
        session.ended_at ?? null,
        session.token_input,
        session.token_output,
        session.token_cache_read,
        session.token_cache_creation,
        session.estimated_cost,
        session.turn_count,
        session.tool_call_count,
        session.status,
        session.capture_fidelity,
        session.permission_mode ?? null,
        session.reasoning_effort ?? null,
        session.updated_at,
      );
  }

  /** Get all sessions, optionally filtered */
  getSessions(opts?: {
    providerId?: string;
    status?: string;
    limit?: number;
  }): SessionRow[] {
    let sql = "SELECT * FROM sessions WHERE 1=1";
    const params: unknown[] = [];

    if (opts?.providerId) {
      sql += " AND provider_id = ?";
      params.push(opts.providerId);
    }
    if (opts?.status) {
      sql += " AND status = ?";
      params.push(opts.status);
    }

    sql += " ORDER BY updated_at DESC";

    if (opts?.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }

    return this.db.prepare(sql).all(...params) as SessionRow[];
  }

  /** Get a single session by ID */
  getSession(id: string): SessionRow | undefined {
    return this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as SessionRow | undefined;
  }

  /** Save ingest state (e.g., byte offsets) */
  setIngestState(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO ingest_state (key, value) VALUES (?, ?)",
      )
      .run(key, value);
  }

  /** Get ingest state */
  getIngestState(key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM ingest_state WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  /** Rebuild the session projection from the stored event ledger. */
  rebuildSessions(): void {
    this.db.exec("DELETE FROM sessions");

    const rows = this.db
      .prepare("SELECT DISTINCT session_id FROM events ORDER BY session_id")
      .all() as Array<{ session_id: string }>;
    const sessionIds = rows.map((row) => row.session_id);
    if (sessionIds.length > 0) {
      this.projectSessions(sessionIds);
    }
  }

  /** Close the database */
  close(): void {
    this.db.close();
  }

  private projectSessions(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      const sessionEvents = this.getEventsBySession(sessionId);
      if (sessionEvents.length === 0) {
        continue;
      }

      const session = createEmptySessionRow(sessionId, sessionEvents[0]);

      for (const event of sessionEvents) {
        const data = event.data as Record<string, unknown>;
        session.provider_id = event.providerId;
        session.updated_at = Math.max(session.updated_at, event.timestamp);
        session.started_at = Math.min(session.started_at, event.timestamp);

        switch (event.type) {
          case "session_started":
            session.title = normalizeSessionTitle(readString(data.title)) ?? session.title;
            session.model = readString(data.model) ?? session.model;
            session.cwd = readString(data.cwd) ?? session.cwd;
            session.git_branch = readString(data.gitBranch) ?? session.git_branch;
            session.permission_mode =
              readString(data.permissionMode) ?? session.permission_mode;
            session.reasoning_effort =
              readString(data.reasoningEffort) ?? session.reasoning_effort;
            break;
          case "prompt_sent": {
            const content = readString(data.content);
            if (!session.title && content) {
              session.title = summarizePrompt(content);
            }
            session.cwd = readString(data.cwd) ?? session.cwd;
            session.git_branch = readString(data.gitBranch) ?? session.git_branch;
            session.permission_mode =
              readString(data.permissionMode) ?? session.permission_mode;
            session.turn_count += 1;
            break;
          }
          case "response_received":
            session.model = readString(data.model) ?? session.model;
            break;
          case "usage_snapshot": {
            const inputTokens = readNumber(data.inputTokens);
            const outputTokens = readNumber(data.outputTokens);
            const cacheReadTokens = readNumber(data.cacheReadTokens);
            const cacheCreationTokens = readNumber(data.cacheCreationTokens);
            const estimatedCost = readNumber(data.estimatedCost);
            const usageMode = readString(data.usageMode);
            const model = readString(data.model) ?? session.model;
            const fallbackCost = estimateCostUSD(model, {
              input: inputTokens ?? 0,
              output: outputTokens ?? 0,
              cacheRead: cacheReadTokens ?? 0,
              cacheWrite: cacheCreationTokens ?? 0,
            });

            if (usageMode === "cumulative") {
              session.token_input = Math.max(session.token_input, inputTokens ?? 0);
              session.token_output = Math.max(session.token_output, outputTokens ?? 0);
              session.token_cache_read = Math.max(
                session.token_cache_read,
                cacheReadTokens ?? 0,
              );
              session.token_cache_creation = Math.max(
                session.token_cache_creation,
                cacheCreationTokens ?? 0,
              );
              session.estimated_cost = Math.max(
                session.estimated_cost,
                estimatedCost ?? fallbackCost,
              );
            } else {
              session.token_input += inputTokens ?? 0;
              session.token_output += outputTokens ?? 0;
              session.token_cache_read += cacheReadTokens ?? 0;
              session.token_cache_creation += cacheCreationTokens ?? 0;
              session.estimated_cost += estimatedCost ?? fallbackCost;
            }

            session.model = model;
            break;
          }
          case "tool_call_started":
            session.tool_call_count += 1;
            break;
          case "session_ended":
            session.ended_at = event.timestamp;
            session.status = "completed";
            break;
          default:
            break;
        }
      }

      if (!session.title) {
        session.title = "Untitled";
      }

      if (session.ended_at == null) {
        session.status = "active";
      }

      this.upsertSession(session);
    }
  }
}

interface EventRow {
  id: string;
  type: string;
  timestamp: number;
  provider_id: string;
  session_id: string;
  turn_index: number | null;
  data: string;
  raw_ref: string | null;
  ingested_at: number;
}

export interface SessionRow {
  id: string;
  provider_id: string;
  title: string;
  model: string;
  cwd: string;
  git_branch: string | null;
  started_at: number;
  ended_at: number | null;
  token_input: number;
  token_output: number;
  token_cache_read: number;
  token_cache_creation: number;
  estimated_cost: number;
  turn_count: number;
  tool_call_count: number;
  status: string;
  capture_fidelity: string;
  permission_mode: string | null;
  reasoning_effort: string | null;
  updated_at: number;
}

function rowToEvent(row: EventRow): NormalizedEvent {
  return {
    id: row.id,
    type: row.type as NormalizedEvent["type"],
    timestamp: row.timestamp,
    providerId: row.provider_id,
    sessionId: row.session_id,
    turnIndex: row.turn_index ?? undefined,
    data: JSON.parse(row.data),
    rawRef: row.raw_ref ?? undefined,
  };
}

function createEmptySessionRow(
  sessionId: string,
  event: NormalizedEvent,
): SessionRow {
  return {
    id: sessionId,
    provider_id: event.providerId,
    title: "",
    model: "",
    cwd: "",
    git_branch: null,
    started_at: event.timestamp,
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
    updated_at: event.timestamp,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizePrompt(content: string): string {
  const firstLine = content.split("\n").find((line) => line.trim().length > 0) ?? content;
  return firstLine.trim().slice(0, 80);
}

function normalizeSessionTitle(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const firstLine =
    trimmed.split("\n").find((line) => line.trim().length > 0) ?? trimmed;
  return firstLine.trim().slice(0, 120);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, inner]) => `${JSON.stringify(key)}:${stableSerialize(inner)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashToUuid(input: string): string {
  const hex = createHash("sha1").update(input).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Helper to create a deterministic event ID so re-ingestion stays idempotent. */
export function createEvent(
  partial: Omit<NormalizedEvent, "id">,
): NormalizedEvent {
  const identity = stableSerialize({
    type: partial.type,
    timestamp: partial.timestamp,
    providerId: partial.providerId,
    sessionId: partial.sessionId,
    turnIndex: partial.turnIndex ?? null,
    rawRef: partial.rawRef ?? null,
    data: partial.data,
  });

  return { id: hashToUuid(identity), ...partial };
}
