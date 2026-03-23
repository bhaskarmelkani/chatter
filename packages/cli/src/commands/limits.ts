import { Command } from "commander";
import chalk from "chalk";
import {
  ClaudeAdapter,
  CodexAdapter,
  type Adapter,
} from "@chatter/core";

const BAR_WIDTH = 30;

function renderBar(usedPercent: number): string {
  const filled = Math.round((usedPercent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;

  const color =
    usedPercent < 50 ? chalk.green : usedPercent < 80 ? chalk.yellow : chalk.red;

  const filledStr = color("\u2588".repeat(filled));
  const emptyStr = chalk.dim("\u2591".repeat(empty));

  return `${filledStr}${emptyStr}`;
}

function formatCountdown(resetsAt: number): string {
  const remaining = Math.max(0, resetsAt - Date.now());
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export const limitsCommand = new Command("limits")
  .description("Show rate limits for all providers")
  .action(async () => {
    console.log(chalk.bold("\nChatter Rate Limits\n"));

    const adapters: Adapter[] = [new ClaudeAdapter(), new CodexAdapter()];
    let anyLimits = false;

    for (const adapter of adapters) {
      const detection = await adapter.detect();
      if (!detection.installed) continue;

      const limits = await adapter.getLimits();
      if (limits.length === 0) continue;

      anyLimits = true;
      console.log(chalk.bold.blue(adapter.manifest.name));

      for (const limit of limits) {
        const countdown = formatCountdown(limit.resetsAt);

        if (limit.telemetryMode === "observed") {
          console.log(`  ${limit.limitId}`);
          console.log(
            chalk.dim(
              `    Observed ${limit.requestsUsed ?? 0} responses and ${(limit.tokensUsed ?? 0).toLocaleString()} tokens in the rolling window`,
            ),
          );
          console.log(chalk.dim(`    Window refreshes in ${countdown}`));
          if (limit.serviceTier) {
            console.log(chalk.dim(`    Service tier: ${limit.serviceTier}`));
          }
          if (limit.description) {
            console.log(chalk.dim(`    ${limit.description}`));
          }
          continue;
        }

        const usedPercent = limit.usedPercent ?? 0;
        const bar = renderBar(usedPercent);
        const pctStr =
          usedPercent < 50
            ? chalk.green(`${usedPercent}%`)
            : usedPercent < 80
              ? chalk.yellow(`${usedPercent}%`)
              : chalk.red(`${usedPercent}%`);
        console.log(`  ${limit.limitId}`);
        console.log(`    ${bar} ${pctStr}`);
        console.log(chalk.dim(`    Resets in ${countdown}`));

        if (limit.planType) {
          console.log(chalk.dim(`    Plan: ${limit.planType}`));
        }
      }

      console.log();
    }

    if (!anyLimits) {
      console.log(chalk.dim("No rate limit data available.\n"));
    }
  });
