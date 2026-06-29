/**
 * CLI entry point — brain <command>
 *
 * Uses commander for CLI parsing. Commands:
 *   init     — create .brain/ directory
 *   start    — launch daemon
 *   stop     — stop daemon
 *   status   — daemon health
 *   rebuild  — wipe and re-index
 */

import { Command } from "commander";
import { initCommand } from "./commands/init.ts";
import { startCommand } from "./commands/start.ts";
import { stopCommand } from "./commands/stop.ts";
import { statusCommand } from "./commands/status.ts";
import { rebuildCommand } from "./commands/rebuild.ts";

const program = new Command();

program
  .name("brain")
  .description("Project Brain — project knowledge engine for AI agents")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize .brain/ directory in the current project")
  .argument("[path]", "Project root path", process.cwd())
  .action(async (path: string) => {
    await initCommand(path);
  });

program
  .command("start")
  .description("Start the Brain daemon")
  .argument("[path]", "Project root path")
  .action(async (path?: string) => {
    await startCommand(path);
  });

program
  .command("stop")
  .description("Stop the Brain daemon")
  .argument("[path]", "Project root path")
  .action(async (path?: string) => {
    await stopCommand(path);
  });

program
  .command("status")
  .description("Show daemon status and capabilities")
  .argument("[path]", "Project root path")
  .action(async (path?: string) => {
    await statusCommand(path);
  });

program
  .command("rebuild")
  .description("Rebuild the index from scratch")
  .argument("[path]", "Project root path")
  .action(async (path?: string) => {
    await rebuildCommand(path);
  });

program.parse(process.argv);