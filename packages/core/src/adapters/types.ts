import type {
  AdapterManifest,
  DetectionResult,
  HealthResult,
  ActiveSession,
  LimitSnapshot,
} from "../schemas/providers.js";
import type { NormalizedEvent } from "../schemas/events.js";

export interface Adapter {
  readonly manifest: AdapterManifest;

  /** Check if the agent is installed and accessible */
  detect(): Promise<DetectionResult>;

  /** Get current health status */
  getHealth(): Promise<HealthResult>;

  /** Ingest events since a timestamp (incremental) */
  ingestEvents(since: number): Promise<NormalizedEvent[]>;

  /** Get current rate limit snapshots */
  getLimits(): Promise<LimitSnapshot[]>;

  /** Detect currently active sessions */
  getActiveSessions(): Promise<ActiveSession[]>;

  /** Restore any adapter-specific incremental cursors or offsets. */
  restoreOffsets?(offsets: Record<string, number>): void;

  /** Export adapter-specific incremental cursors or offsets. */
  exportOffsets?(): Record<string, number>;
}
