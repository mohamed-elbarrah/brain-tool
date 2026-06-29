/**
 * brain stop — send shutdown signal to the daemon.
 */

import fs from "node:fs";
import path from "node:path";
import { detectProjectRoot } from "../../config/detection.ts";

export async function stopCommand(rootPath?: string): Promise<void> {
  const projectRoot = rootPath ?? detectProjectRoot();
  if (!projectRoot) {
    console.error("No project root found.");
    process.exit(1);
  }

  const pidPath = path.join(projectRoot, ".brain", "brain.pid");
  try {
    const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
    process.kill(pid, "SIGTERM");
    console.error(`Sent SIGTERM to daemon (PID ${pid})`);
  } catch (e: any) {
    if (e.code === "ENOENT") {
      console.error("Daemon is not running (no PID file found).");
    } else if (e.code === "ESRCH") {
      console.error("Daemon process not found. Removing stale PID file.");
      fs.unlinkSync(pidPath);
    } else {
      console.error(`Failed to stop daemon: ${e.message}`);
      process.exit(1);
    }
  }
}