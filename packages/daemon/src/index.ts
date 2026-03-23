/**
 * Chatter daemon entry point.
 *
 * Wires together adapters, ledger, watchers, scheduler, and HTTP server.
 * Data directory: ~/Library/Application Support/Chatter/
 * Event ledger:   ~/Library/Application Support/Chatter/events.sqlite
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  ClaudeAdapter,
  CodexAdapter,
  EventLedger,
  registerAdapter,
} from "@chatter/core";
import { createServer, type ServerHandle } from "./server.js";
import { ClaudeWatcher } from "./watchers/claude-watcher.js";
import { CodexWatcher } from "./watchers/codex-watcher.js";
import { Scheduler } from "./scheduler.js";

export { createServer } from "./server.js";
export { Scheduler } from "./scheduler.js";
export { ClaudeWatcher } from "./watchers/claude-watcher.js";
export { CodexWatcher } from "./watchers/codex-watcher.js";
export { EventCoalescer } from "./watchers/coalescer.js";

// ---------------------------------------------------------------------------
// Data directory
// ---------------------------------------------------------------------------

const DATA_DIR =
  process.env.CHATTER_DATA_DIR ??
  join(homedir(), "Library", "Application Support", "Chatter");
const DB_PATH = join(DATA_DIR, "events.sqlite");

function parseSavedOffsets(ledger: EventLedger, providerId: string): Record<string, number> {
  const raw = ledger.getIngestState(`offsets:${providerId}`);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function parseSavedSince(ledger: EventLedger, providerId: string): number {
  const raw = ledger.getIngestState(`since:${providerId}`);
  if (!raw) {
    return 0;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function persistCheckpoint(
  ledger: EventLedger,
  providerId: string,
  since: number,
  offsets: Record<string, number>,
): void {
  ledger.setIngestState(`since:${providerId}`, String(since));
  ledger.setIngestState(`offsets:${providerId}`, JSON.stringify(offsets));
}

// ---------------------------------------------------------------------------
// Daemon lifecycle
// ---------------------------------------------------------------------------

export interface DaemonHandle {
  server: ServerHandle;
  scheduler: Scheduler;
  claudeWatcher: ClaudeWatcher;
  codexWatcher: CodexWatcher;
  ledger: EventLedger;
  /** Gracefully shut down all components. */
  shutdown(): Promise<void>;
}

export interface DaemonOpts {
  host?: string;
  port?: number;
  /** Override the default database path (useful for tests). */
  dbPath?: string;
}

/**
 * Create and start the full daemon stack.
 *
 * Order of operations:
 * 1. Open ledger (creates DB if needed)
 * 2. Create and register adapters
 * 3. Create scheduler, watchers, and server
 * 4. Start watchers, scheduler, and server
 */
export async function startDaemon(
  opts?: DaemonOpts,
): Promise<DaemonHandle> {
  // 1. Ledger
  const ledger = new EventLedger(opts?.dbPath ?? DB_PATH);
  ledger.rebuildSessions();

  // 2. Adapters
  const claudeAdapter = new ClaudeAdapter();
  const codexAdapter = new CodexAdapter();
  registerAdapter(claudeAdapter);
  registerAdapter(codexAdapter);

  const adapters = [claudeAdapter, codexAdapter];
  const initialSince = new Map<string, number>();

  for (const adapter of adapters) {
    const offsets = parseSavedOffsets(ledger, adapter.manifest.id);
    const since = parseSavedSince(ledger, adapter.manifest.id);
    adapter.restoreOffsets?.(offsets);
    initialSince.set(adapter.manifest.id, since);
  }

  for (const adapter of adapters) {
    const since = initialSince.get(adapter.manifest.id) ?? 0;
    const events = await adapter.ingestEvents(since);
    if (events.length > 0) {
      ledger.insertEvents(events);
      const maxTimestamp = Math.max(since, ...events.map((event) => event.timestamp));
      persistCheckpoint(
        ledger,
        adapter.manifest.id,
        maxTimestamp,
        adapter.exportOffsets?.() ?? {},
      );
      initialSince.set(adapter.manifest.id, maxTimestamp);
    }
  }

  // 3. Scheduler
  let serverHandle: ServerHandle | undefined;

  const scheduler = new Scheduler({
    adapters,
    ledger,
    onUpdate(kind, providerId) {
      serverHandle?.broadcast("scheduler", { kind, providerId });
    },
  });

  // 4. Watchers
  const claudeWatcher = new ClaudeWatcher({
    adapter: claudeAdapter,
    ledger,
    initialSince: initialSince.get("claude") ?? 0,
    onIngest(_batch, eventCount) {
      if (eventCount > 0) {
        serverHandle?.broadcast("ingest", {
          provider: "claude",
          eventCount,
        });
      }
    },
    onCheckpoint(since, offsets) {
      persistCheckpoint(ledger, "claude", since, offsets);
    },
  });

  const codexWatcher = new CodexWatcher({
    adapter: codexAdapter,
    ledger,
    initialSince: initialSince.get("codex") ?? 0,
    onIngest(_batch, eventCount) {
      if (eventCount > 0) {
        serverHandle?.broadcast("ingest", {
          provider: "codex",
          eventCount,
        });
      }
    },
    onCheckpoint(since, offsets) {
      persistCheckpoint(ledger, "codex", since, offsets);
    },
  });

  // 5. Server
  serverHandle = createServer(
    { adapters, ledger, scheduler },
    { host: opts?.host, port: opts?.port },
  );

  // 6. Start everything
  claudeWatcher.start();
  codexWatcher.start();
  scheduler.start();
  await serverHandle.start();

  // 7. Handle
  return {
    server: serverHandle,
    scheduler,
    claudeWatcher,
    codexWatcher,
    ledger,
    async shutdown() {
      scheduler.stop();
      await claudeWatcher.stop();
      await codexWatcher.stop();
      await serverHandle!.stop();
      ledger.close();
    },
  };
}

async function runFromCli(): Promise<void> {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf("--port");
  const parsedPort =
    portIndex >= 0 && args[portIndex + 1]
      ? Number.parseInt(args[portIndex + 1], 10)
      : Number.parseInt(process.env.CHATTER_PORT ?? "4200", 10);
  const host = process.env.CHATTER_HOST ?? "127.0.0.1";
  const port = Number.isFinite(parsedPort) ? parsedPort : 4200;

  const daemon = await startDaemon({ host, port });

  const shutdown = async () => {
    await daemon.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void runFromCli();
}
