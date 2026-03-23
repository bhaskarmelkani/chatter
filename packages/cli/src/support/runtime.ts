import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface RuntimeState {
  pid: number;
  host: string;
  port: number;
  startedAt: string;
  dataDir: string;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4200;

export function getDataDir(): string {
  return process.env.CHATTER_DATA_DIR ?? join(homedir(), "Library", "Application Support", "Chatter");
}

export function getLedgerPath(): string {
  return join(getDataDir(), "events.sqlite");
}

export function getRuntimePath(): string {
  return join(getDataDir(), "runtime.json");
}

export function ensureDataDir(): string {
  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function readRuntimeState(): RuntimeState | null {
  const runtimePath = getRuntimePath();
  if (!existsSync(runtimePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(runtimePath, "utf-8")) as RuntimeState;
  } catch {
    return null;
  }
}

export function writeRuntimeState(state: RuntimeState): void {
  writeFileSync(getRuntimePath(), JSON.stringify(state, null, 2), "utf-8");
}

export function clearRuntimeState(): void {
  const runtimePath = getRuntimePath();
  if (existsSync(runtimePath)) {
    unlinkSync(runtimePath);
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function isDaemonResponsive(
  runtime: Pick<RuntimeState, "host" | "port">,
): Promise<boolean> {
  try {
    const response = await fetch(
      `http://${runtime.host}:${runtime.port}/api/health`,
    );
    return response.ok;
  } catch {
    return false;
  }
}
