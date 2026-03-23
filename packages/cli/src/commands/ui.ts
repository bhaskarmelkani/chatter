import { Command } from "commander";
import chalk from "chalk";
import { exec } from "node:child_process";
import { DEFAULT_HOST, DEFAULT_PORT, readRuntimeState } from "../support/runtime.js";

export const uiCommand = new Command("ui")
  .description("Open the Chatter dashboard in your browser")
  .option("--url", "Print the URL without opening the browser")
  .action(async (opts) => {
    const runtime = readRuntimeState();
    const host = runtime?.host ?? DEFAULT_HOST;
    const port = runtime?.port ?? DEFAULT_PORT;
    const url = `http://${host}:${port}`;

    if (opts.url) {
      console.log(url);
      return;
    }

    console.log(chalk.dim(`Opening ${url} ...`));

    // Use macOS `open` command
    exec(`open "${url}"`, (err) => {
      if (err) {
        console.error(
          chalk.red(`Could not open browser: ${err.message}`),
        );
        console.log(chalk.dim(`Open manually: ${url}`));
      }
    });
  });
