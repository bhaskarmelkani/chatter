/**
 * Watches ~/.claude/projects/ for JSONL changes and feeds them
 * through the ClaudeAdapter into the EventLedger.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { watch, type FSWatcher } from "chokidar";
import type { ClaudeAdapter, EventLedger } from "@chatter/core";
import { EventCoalescer, type CoalescedBatch } from "./coalescer.js";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface ClaudeWatcherOpts {
  adapter: ClaudeAdapter;
  ledger: EventLedger;
  initialSince?: number;
  /** Called after each ingestion batch (e.g. to push SSE events). */
  onIngest?: (batch: CoalescedBatch, eventCount: number) => void;
  onCheckpoint?: (since: number, offsets: Record<string, number>) => void;
}

export class ClaudeWatcher {
  private watcher: FSWatcher | null = null;
  private coalescer: EventCoalescer;
  private readonly adapter: ClaudeAdapter;
  private readonly ledger: EventLedger;
  private readonly onIngest?: ClaudeWatcherOpts["onIngest"];
  private readonly onCheckpoint?: ClaudeWatcherOpts["onCheckpoint"];
  private lastIngest: number;

  constructor(opts: ClaudeWatcherOpts) {
    this.adapter = opts.adapter;
    this.ledger = opts.ledger;
    this.onIngest = opts.onIngest;
    this.onCheckpoint = opts.onCheckpoint;
    this.lastIngest = opts.initialSince ?? 0;

    this.coalescer = new EventCoalescer((batch) => {
      void this.handleBatch(batch);
    });
  }

  /** Start watching.  Returns false if the watch directory does not exist. */
  start(): boolean {
    if (!existsSync(PROJECTS_DIR)) {
      return false;
    }

    this.watcher = watch(join(PROJECTS_DIR, "**/*.jsonl"), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher.on("change", (path) => this.coalescer.push(path));
    this.watcher.on("add", (path) => this.coalescer.push(path));

    return true;
  }

  async stop(): Promise<void> {
    this.coalescer.flush();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
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
      // Log but do not crash the watcher
      console.error("[claude-watcher] ingest error:", err);
    }
  }
}
