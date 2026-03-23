import { Command } from "commander";
import chalk from "chalk";
import {
  ClaudeAdapter,
  CodexAdapter,
  type Adapter,
} from "@chatter/core";
import {
  isDaemonResponsive,
  isProcessRunning,
  readRuntimeState,
} from "../support/runtime.js";

export const statusCommand = new Command("status")
  .description("Show daemon and provider status")
  .action(async () => {
    console.log(chalk.bold("\nChatter Status\n"));

    // Daemon status
    const runtime = readRuntimeState();
    const daemonHealthy = runtime
      ? isProcessRunning(runtime.pid) || await isDaemonResponsive(runtime)
      : false;

    if (runtime?.pid && daemonHealthy) {
      console.log(chalk.green(`Daemon: running (PID ${runtime.pid})`));
      console.log(chalk.dim(`  URL: http://${runtime.host}:${runtime.port}`));
      console.log(chalk.dim(`  Started: ${runtime.startedAt}`));
    } else {
      console.log(chalk.red("Daemon: not running"));
      if (runtime) {
        console.log(chalk.dim("  (stale runtime file exists)"));
      }
    }

    console.log();

    // Provider status
    const adapters: Adapter[] = [new ClaudeAdapter(), new CodexAdapter()];

    for (const adapter of adapters) {
      const { manifest } = adapter;
      const detection = await adapter.detect();

      if (!detection.installed) {
        console.log(chalk.dim(`${manifest.name}: not installed`));
        continue;
      }

      // Health
      const health = await adapter.getHealth();
      const statusColor =
        health.status === "ok"
          ? chalk.green
          : health.status === "degraded"
            ? chalk.yellow
            : chalk.red;

      console.log(
        `${chalk.bold(manifest.name)}: ${statusColor(health.status)} ${chalk.dim(`- ${health.details}`)}`,
      );

      if (detection.version) {
        console.log(chalk.dim(`  Version: ${detection.version}`));
      }

      // Active sessions
      const sessions = await adapter.getActiveSessions();
      console.log(
        chalk.dim(
          `  Active sessions: ${sessions.length > 0 ? chalk.cyan(String(sessions.length)) : "0"}`,
        ),
      );

      for (const session of sessions) {
        console.log(
          chalk.dim(
            `    - ${session.sessionId.slice(0, 8)}... ${session.cwd}`,
          ),
        );
      }
    }

    console.log();
  });
