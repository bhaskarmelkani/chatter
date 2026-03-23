/**
 * Watches ~/.codex/sessions/ for new rollout JSONL files and
 * polls ~/.codex/state_5.sqlite-wal for changes.
 *
 * Changes are fed through the CodexAdapter into the EventLedger.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { watch, type FSWatcher } from "chokidar";
import type { CodexAdapter, EventLedger } from "@chatter/core";
import { EventCoalescer, type CoalescedBatch } from "./coalescer.js";

const CODEX_DIR = join(homedir(), ".codex");
const SESSIONS_DIR = join(CODEX_DIR, "sessions");
const WAL_PATH = join(CODEX_DIR, "state_5.sqlite-wal");

export interface CodexWatcherOpts {
  adapter: CodexAdapter;
  ledger: EventLedger;
  initialSince?: number;
  /** Debounce interval for WAL polling in ms (default 5 000). */
  walDebounceMs?: number;
  /** Called after each ingestion batch. */
  onIngest?: (batch: CoalescedBatch, eventCount: number) => void;
  onCheckpoint?: (since: number, offsets: Record<string, number>) => void;
}

export class CodexWatcher {
  private fileWatcher: FSWatcher | null = null;
  private walInterval: ReturnType<typeof setInterval> | null = null;
  private coalescer: EventCoalescer;
  private readonly adapter: CodexAdapter;
  private readonly ledger: EventLedger;
  private readonly walDebounceMs: number;
  private readonly onIngest?: CodexWatcherOpts["onIngest"];
  private readonly onCheckpoint?: CodexWatcherOpts["onCheckpoint"];
  private lastIngest: number;
  private lastWalMtime = 0;

  constructor(opts: CodexWatcherOpts) {
    this.adapter = opts.adapter;
    this.ledger = opts.ledger;
    this.walDebounceMs = opts.walDebounceMs ?? 5_000;
    this.onIngest = opts.onIngest;
    this.onCheckpoint = opts.onCheckpoint;
    this.lastIngest = opts.initialSince ?? 0;

    this.coalescer = new EventCoalescer((batch) => {
      void this.handleBatch(batch);
    });
  }

  /**
   * Start watching.  Returns false if neither the sessions directory
   * nor the WAL file exist.
   */
  start(): boolean {
    let watching = false;

    // 1. Watch sessions directory for new JSONL rollout files.
    if (existsSync(SESSIONS_DIR)) {
      this.fileWatcher = watch(join(SESSIONS_DIR, "**/*.jsonl"), {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });

      this.fileWatcher.on("add", (path) => this.coalescer.push(path));
      this.fileWatcher.on("change", (path) => this.coalescer.push(path));
      watching = true;
    }

    // 2. Poll the SQLite WAL for mtime changes.
    this.walInterval = setInterval(() => {
      this.checkWal();
    }, this.walDebounceMs);

    // Do an initial WAL check so we pick up the current mtime.
    this.checkWal();

    return watching || existsSync(WAL_PATH);
  }

  async stop(): Promise<void> {
    this.coalescer.flush();
    if (this.walInterval) {
      clearInterval(this.walInterval);
      this.walInterval = null;
    }
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }

  private checkWal(): void {
    try {
      if (!existsSync(WAL_PATH)) return;
      const mtime = statSync(WAL_PATH).mtimeMs;
      if (mtime > this.lastWalMtime) {
        this.lastWalMtime = mtime;
        this.coalescer.push(WAL_PATH);
      }
    } catch {
      // WAL may not exist or be locked; ignore
    }
  }

  private async handleBatch(batch: CoalescedBatch): Promise<void> {
    try {
      const events = await this.adapter.ingestEvents(this.lastIngest);
      if (events.length > 0) {
        this.ledger.insertEvents(events);
        this.lastIngest = Math.max(
          this.lastIngest,
          ...events.map((event) => event.timestamp),
        );
        this.onCheckpoint?.(
          this.lastIngest,
          this.adapter.exportOffsets?.() ?? {},
        );
      }
      this.onIngest?.(batch, events.length);
    } catch (err) {
      console.error("[codex-watcher] ingest error:", err);
    }
  }
}
