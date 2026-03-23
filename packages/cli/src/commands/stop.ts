import { Command } from "commander";
import chalk from "chalk";
import {
  clearRuntimeState,
  isProcessRunning,
  readRuntimeState,
} from "../support/runtime.js";

export const stopCommand = new Command("stop")
  .description("Stop the Chatter daemon")
  .action(async () => {
    const runtime = readRuntimeState();
    if (!runtime) {
      console.log(chalk.yellow("Daemon is not running (no runtime file found)."));
      return;
    }

    // Check if the process is actually running
    const running = isProcessRunning(runtime.pid);

    if (running) {
      try {
        process.kill(runtime.pid, "SIGTERM");
        console.log(chalk.green(`Sent SIGTERM to daemon (PID ${runtime.pid}).`));
      } catch (err) {
        console.error(
          chalk.red(`Failed to stop daemon (PID ${runtime.pid}): ${err}`),
        );
      }
    } else {
      console.log(
        chalk.yellow(`Daemon process ${runtime.pid} is not running (stale runtime file).`),
      );
    }

    clearRuntimeState();
    console.log(chalk.dim("Runtime file removed."));
  });
