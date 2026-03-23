/**
 * Periodic background tasks for the daemon.
 *
 * - Every 30 s: poll active sessions from each adapter.
 * - Every 60 s: poll rate-limit snapshots from each adapter.
 *
 * Results are inserted into the EventLedger and optionally
 * forwarded to an SSE broadcast callback.
 */

import type {
  Adapter,
  EventLedger,
  LimitSnapshot,
  ActiveSession,
} from "@chatter/core";

export interface SchedulerOpts {
  adapters: Adapter[];
  ledger: EventLedger;
  /** Called when fresh data arrives (e.g. to push SSE events). */
  onUpdate?: (kind: "sessions" | "limits", providerId: string) => void;
  /** Session poll interval in ms (default 30 000). */
  sessionIntervalMs?: number;
  /** Limit poll interval in ms (default 60 000). */
  limitIntervalMs?: number;
}

export class Scheduler {
  private readonly adapters: Adapter[];
  private readonly ledger: EventLedger;
  private readonly onUpdate?: SchedulerOpts["onUpdate"];
  private sessionTimer: ReturnType<typeof setInterval> | null = null;
  private limitTimer: ReturnType<typeof setInterval> | null = null;

  /** Most recently observed sessions per provider. */
  activeSessions = new Map<string, ActiveSession[]>();
  /** Most recently observed limits per provider. */
  latestLimits = new Map<string, LimitSnapshot[]>();

  constructor(opts: SchedulerOpts) {
    this.adapters = opts.adapters;
    this.ledger = opts.ledger;
    this.onUpdate = opts.onUpdate;
  }

  start(): void {
    const sessionMs = 30_000;
    const limitMs = 60_000;

    // Fire immediately, then on interval.
    void this.pollSessions();
    void this.pollLimits();

    this.sessionTimer = setInterval(() => {
      void this.pollSessions();
    }, sessionMs);

    this.limitTimer = setInterval(() => {
      void this.pollLimits();
    }, limitMs);
  }

  stop(): void {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
    if (this.limitTimer) {
      clearInterval(this.limitTimer);
      this.limitTimer = null;
    }
  }

  /** One-shot session poll across all adapters. */
  async pollSessions(): Promise<void> {
    for (const adapter of this.adapters) {
      try {
        const sessions = await adapter.getActiveSessions();
        this.activeSessions.set(adapter.manifest.id, sessions);
        this.onUpdate?.("sessions", adapter.manifest.id);
      } catch (err) {
        console.error(
          `[scheduler] session poll failed for ${adapter.manifest.id}:`,
          err,
        );
      }
    }
  }

  /** One-shot limit poll across all adapters. */
  async pollLimits(): Promise<void> {
    for (const adapter of this.adapters) {
      try {
        const limits = await adapter.getLimits();
        this.latestLimits.set(adapter.manifest.id, limits);
        this.onUpdate?.("limits", adapter.manifest.id);
      } catch (err) {
        console.error(
          `[scheduler] limit poll failed for ${adapter.manifest.id}:`,
          err,
        );
      }
    }
  }
}
