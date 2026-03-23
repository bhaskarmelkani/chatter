import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  ensureDataDir,
  getRuntimePath,
  isDaemonResponsive,
  isProcessRunning,
  readRuntimeState,
  writeRuntimeState,
} from "../support/runtime.js";

export const startCommand = new Command("start")
  .description("Start the Chatter daemon")
  .option("--port <port>", "Port to listen on", String(DEFAULT_PORT))
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    const runtime = readRuntimeState();

    // Check if already running
    if (
      runtime?.pid &&
      (isProcessRunning(runtime.pid) || await isDaemonResponsive(runtime))
    ) {
      console.log(
        chalk.yellow(
          `Daemon is already running (PID ${runtime.pid}) at http://${runtime.host}:${runtime.port}`,
        ),
      );
      return;
    }

    const dataDir = ensureDataDir();

    // Resolve the daemon entry point from the @chatter/daemon package
    let daemonEntry: string;
    try {
      daemonEntry = fileURLToPath(import.meta.resolve("@chatter/daemon"));
    } catch {
      const fallback = fileURLToPath(
        new URL("../../../daemon/dist/index.js", import.meta.url),
      );
      if (!existsSync(fallback)) {
        console.error(chalk.red("Could not resolve @chatter/daemon. Is it built?"));
        process.exit(1);
      }
      daemonEntry = fallback;
    }

    const child = spawn(process.execPath, [daemonEntry, "--port", String(port)], {
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        CHATTER_DATA_DIR: dataDir,
        CHATTER_PORT: String(port),
        CHATTER_HOST: DEFAULT_HOST,
      }
    });

    if (child.pid == null) {
      console.error(chalk.red("Failed to start daemon: no PID returned."));
      process.exit(1);
    }

    const stderrChunks: Buffer[] = [];
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.from(chunk));
    });

    const startupResult = await waitForDaemonStart(child, port);

    if (startupResult !== "running") {
      const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
      console.error(
        chalk.red(
          startupResult === "exited"
            ? "Daemon exited during startup."
            : "Daemon did not become healthy during startup.",
        ),
      );
      if (stderr) {
        console.error(chalk.dim(stderr));
      }
      process.exit(1);
    }

    writeRuntimeState({
      pid: child.pid,
      host: DEFAULT_HOST,
      port,
      startedAt: new Date().toISOString(),
      dataDir,
    });
    child.stderr?.destroy();
    child.unref();

    console.log(chalk.green(`Daemon started (PID ${child.pid})`));
    console.log(chalk.dim(`  URL: http://${DEFAULT_HOST}:${port}`));
    console.log(chalk.dim(`  Runtime file: ${getRuntimePath()}`));
    console.log(chalk.dim(`  Data dir: ${dataDir}`));
  });

async function waitForDaemonStart(
  child: ReturnType<typeof spawn>,
  port: number,
): Promise<"running" | "exited" | "timeout"> {
  const startedAt = Date.now();
  const timeoutMs = 4_000;
  const healthUrl = `http://${DEFAULT_HOST}:${port}/api/health`;

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode != null) {
      return "exited";
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return "running";
      }
    } catch {
      // The daemon may still be booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return child.exitCode == null ? "timeout" : "exited";
}
