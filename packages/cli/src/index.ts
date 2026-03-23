#!/usr/bin/env node
import { Command } from "commander";
import { doctorCommand } from "./commands/doctor.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { limitsCommand } from "./commands/limits.js";
import { sessionsCommand } from "./commands/sessions.js";
import { uiCommand } from "./commands/ui.js";

const program = new Command();

program
  .name("chatter")
  .description("Coding agent control plane")
  .version("0.1.0");

program.addCommand(doctorCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(limitsCommand);
program.addCommand(sessionsCommand);
program.addCommand(uiCommand);

program.parse();
