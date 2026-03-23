import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "node:fs";
import { EventLedger, type SessionRow } from "@chatter/core";
import { getLedgerPath } from "../support/runtime.js";

function getLedger(): EventLedger | null {
  const ledgerPath = getLedgerPath();
  if (!existsSync(ledgerPath)) {
    return null;
  }
  return new EventLedger(ledgerPath);
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatDuration(startedAt: number, endedAt: number | null): string {
  const end = endedAt ?? Date.now();
  const seconds = Math.floor((end - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function statusColor(status: string): (s: string) => string {
  switch (status) {
    case "active":
      return chalk.green;
    case "completed":
      return chalk.blue;
    case "abandoned":
      return chalk.yellow;
    default:
      return chalk.dim;
  }
}

function printSessionRow(session: SessionRow): void {
  const color = statusColor(session.status);
  const duration = formatDuration(session.started_at, session.ended_at);

  console.log(
    `  ${chalk.bold(session.id.slice(0, 8))}  ${color(session.status.padEnd(10))}  ${chalk.dim(session.provider_id.padEnd(8))}  ${duration.padEnd(8)}  ${chalk.dim(session.cwd)}`,
  );
}

const listCommand = new Command("list")
  .description("List recent sessions")
  .option("-n, --limit <count>", "Number of sessions to show", "20")
  .option("--provider <id>", "Filter by provider ID")
  .option("--status <status>", "Filter by status (active, completed, abandoned)")
  .action(async (opts) => {
    const ledger = getLedger();
    if (!ledger) {
      console.log(chalk.yellow("No ledger found. Has the daemon run yet?"));
      return;
    }

    try {
      const sessions = ledger.getSessions({
        providerId: opts.provider,
        status: opts.status,
        limit: parseInt(opts.limit, 10),
      });

      if (sessions.length === 0) {
        console.log(chalk.dim("No sessions found."));
        return;
      }

      console.log(
        chalk.bold(
          `\n  ${"ID".padEnd(10)}${"STATUS".padEnd(12)}${"PROVIDER".padEnd(10)}${"DURATION".padEnd(10)}CWD\n`,
        ),
      );

      for (const session of sessions) {
        printSessionRow(session);
      }

      console.log(chalk.dim(`\n  ${sessions.length} session(s) shown.\n`));
    } finally {
      ledger.close();
    }
  });

const showCommand = new Command("show")
  .description("Show details for a specific session")
  .argument("<id>", "Session ID (or prefix)")
  .action(async (idArg: string) => {
    const ledger = getLedger();
    if (!ledger) {
      console.log(chalk.yellow("No ledger found. Has the daemon run yet?"));
      return;
    }

    try {
      // Try exact match first, then prefix match
      let session: SessionRow | undefined = ledger.getSession(idArg);

      if (!session) {
        // Prefix match: get all sessions and find one starting with the prefix
        const all = ledger.getSessions({ limit: 500 });
        session = all.find((s) => s.id.startsWith(idArg));
      }

      if (!session) {
        console.error(chalk.red(`No session found matching "${idArg}".`));
        process.exit(1);
      }

      const color = statusColor(session.status);

      console.log(chalk.bold(`\nSession ${session.id}\n`));
      console.log(`  Provider:    ${session.provider_id}`);
      console.log(`  Status:      ${color(session.status)}`);
      console.log(`  Model:       ${session.model || chalk.dim("unknown")}`);
      console.log(`  Title:       ${session.title || chalk.dim("(none)")}`);
      console.log(`  Directory:   ${session.cwd}`);

      if (session.git_branch) {
        console.log(`  Git branch:  ${session.git_branch}`);
      }

      console.log(`  Started:     ${formatTimestamp(session.started_at)}`);
      if (session.ended_at) {
        console.log(`  Ended:       ${formatTimestamp(session.ended_at)}`);
      }
      console.log(
        `  Duration:    ${formatDuration(session.started_at, session.ended_at)}`,
      );

      console.log();
      console.log(chalk.bold("  Tokens"));
      console.log(`    Input:           ${session.token_input.toLocaleString()}`);
      console.log(`    Output:          ${session.token_output.toLocaleString()}`);
      console.log(`    Cache read:      ${session.token_cache_read.toLocaleString()}`);
      console.log(`    Cache creation:  ${session.token_cache_creation.toLocaleString()}`);

      console.log();
      console.log(`  Estimated cost:    $${session.estimated_cost.toFixed(4)}`);
      console.log(`  Turns:             ${session.turn_count}`);
      console.log(`  Tool calls:        ${session.tool_call_count}`);
      console.log(`  Capture fidelity:  ${session.capture_fidelity}`);

      if (session.permission_mode) {
        console.log(`  Permission mode:   ${session.permission_mode}`);
      }
      if (session.reasoning_effort) {
        console.log(`  Reasoning effort:  ${session.reasoning_effort}`);
      }

      // Show recent events for this session
      const events = ledger.getEventsBySession(session.id);
      if (events.length > 0) {
        console.log(chalk.bold(`\n  Events (${events.length})`));
        const shown = events.slice(-10);
        if (events.length > 10) {
          console.log(chalk.dim(`    ... ${events.length - 10} earlier events omitted`));
        }
        for (const evt of shown) {
          console.log(
            chalk.dim(
              `    ${formatTimestamp(evt.timestamp)}  ${evt.type}`,
            ),
          );
        }
      }

      console.log();
    } finally {
      ledger.close();
    }
  });

export const sessionsCommand = new Command("sessions")
  .description("Manage and inspect sessions")
  .addCommand(listCommand)
  .addCommand(showCommand);
