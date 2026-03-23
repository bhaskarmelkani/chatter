/**
 * Event batching buffer that coalesces rapid file-change callbacks
 * into time-windowed batches.
 *
 * When a file event arrives, the coalescer waits for `windowMs`
 * (default 3 000 ms) of silence before flushing.  If more events
 * arrive inside the window the timer resets, so rapid bursts
 * collapse into a single batch callback.
 */

export interface CoalescedBatch {
  /** Deduplicated set of changed file paths */
  paths: string[];
  /** Timestamp when the window opened */
  openedAt: number;
  /** Timestamp when the window flushed */
  flushedAt: number;
}

export type BatchCallback = (batch: CoalescedBatch) => void;

export class EventCoalescer {
  private pending = new Map<string, number>(); // path -> first-seen ts
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly windowMs: number;
  private readonly cb: BatchCallback;
  private openedAt = 0;

  constructor(cb: BatchCallback, windowMs = 3_000) {
    this.cb = cb;
    this.windowMs = windowMs;
  }

  /** Call this whenever a file-change event fires. */
  push(filePath: string): void {
    const now = Date.now();
    if (this.pending.size === 0) {
      this.openedAt = now;
    }
    this.pending.set(filePath, now);
    this.resetTimer();
  }

  /** Force-flush any pending events (used at shutdown). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.emit();
  }

  /** Cancel any pending timer without emitting. */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
  }

  private resetTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit();
    }, this.windowMs);
  }

  private emit(): void {
    if (this.pending.size === 0) return;

    const batch: CoalescedBatch = {
      paths: Array.from(this.pending.keys()),
      openedAt: this.openedAt,
      flushedAt: Date.now(),
    };

    this.pending.clear();
    this.cb(batch);
  }
}
