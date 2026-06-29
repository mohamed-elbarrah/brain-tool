/**
 * PID file management.
 *
 * Writes .brain/brain.pid on start, removes on stop.
 * Used by `brain stop` to find the daemon process.
 */

import fs from "node:fs";
import path from "node:path";

export class PidFile {
  private pidPath: string;

  constructor(brainDir: string) {
    this.pidPath = path.join(brainDir, "brain.pid");
  }

  /** Write the current PID to the file. */
  write(): void {
    fs.writeFileSync(this.pidPath, String(process.pid), "utf-8");
  }

  /** Read the PID from the file. Returns null if not found. */
  read(): number | null {
    try {
      return parseInt(fs.readFileSync(this.pidPath, "utf-8").trim(), 10);
    } catch {
      return null;
    }
  }

  /** Remove the PID file. */
  remove(): void {
    try { fs.unlinkSync(this.pidPath); } catch { /* ignore */ }
  }
}