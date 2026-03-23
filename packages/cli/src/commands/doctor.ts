import { Command } from "commander";
import chalk from "chalk";
import {
  ClaudeAdapter,
  CodexAdapter,
  type Adapter,
} from "@chatter/core";

export const doctorCommand = new Command("doctor")
  .description("Check coding agent health and data availability")
  .action(async () => {
    console.log(chalk.bold("\nChatter Control Plane - Doctor\n"));

    const adapters: Adapter[] = [new ClaudeAdapter(), new CodexAdapter()];

    for (const adapter of adapters) {
      const { manifest } = adapter;
      console.log(chalk.bold.blue(`${manifest.name}`));
      console.log(chalk.dim(`  Adapter version: ${manifest.version}`));
      console.log(chalk.dim(`  Data locations: ${manifest.dataLocations.join(", ")}`));

      // Detection
      const detection = await adapter.detect();
      if (detection.installed) {
        console.log(chalk.green(`  Installed: yes`));
        if (detection.version) {
          console.log(chalk.dim(`  CLI version: ${detection.version}`));
        }
        if (detection.dataPath) {
          console.log(chalk.dim(`  Data path: ${detection.dataPath}`));
        }
      } else {
        console.log(chalk.red(`  Installed: no`));
        console.log();
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
      console.log(statusColor(`  Health: ${health.status} - ${health.details}`));

      // Active sessions
      const activeSessions = await adapter.getActiveSessions();
      if (activeSessions.length > 0) {
        console.log(chalk.cyan(`  Active sessions: ${activeSessions.length}`));
        for (const session of activeSessions) {
          console.log(
            chalk.dim(
              `    - ${session.sessionId.slice(0, 8)}... in ${session.cwd}`,
            ),
          );
        }
      } else {
        console.log(chalk.dim(`  Active sessions: none`));
      }

      // Limits (Codex only)
      const limits = await adapter.getLimits();
      if (limits.length > 0) {
        console.log(chalk.cyan(`  Rate limits:`));
        for (const limit of limits) {
          if (limit.telemetryMode === "observed") {
            const resetIn = Math.max(0, Math.round((limit.resetsAt - Date.now()) / 60000));
            console.log(
              `    ${limit.limitId}: observed ${(limit.requestsUsed ?? 0).toLocaleString()} responses, ${(limit.tokensUsed ?? 0).toLocaleString()} tokens (window refreshes in ${resetIn}m)`,
            );
            continue;
          }

          const pct = limit.usedPercent ?? 0;
          const pctColor = pct < 50 ? chalk.green : pct < 80 ? chalk.yellow : chalk.red;
          const resetIn = Math.max(0, Math.round((limit.resetsAt - Date.now()) / 60000));
          console.log(
            `    ${limit.limitId}: ${pctColor(`${pct}%`)} used (resets in ${resetIn}m)`,
          );
        }
      }

      // Capture capabilities
      console.log(
        chalk.dim(
          `  Capture modes: ${manifest.captureModes.join(", ")}`,
        ),
      );
      console.log(
        chalk.dim(
          `  Event types: ${manifest.eventTypes.join(", ")}`,
        ),
      );

      console.log();
    }

    console.log(chalk.bold.green("Doctor check complete.\n"));
  });
