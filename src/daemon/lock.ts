/**
 * Single-instance lock — prevents multiple daemon instances.
 *
 * [HARD] §3.5: Uses exclusive file lock. Exits if another daemon is running.
 * Lock file is at .brain/brain.lock.
 */

import fs from "node:fs";
import path from "node:path";

export class InstanceLock {
  private lockPath: string;
  private fd: number | undefined;

  constructor(brainDir: string) {
    this.lockPath = path.join(brainDir, "brain.lock");
  }

  /** Try to acquire the lock. Returns true if acquired, false if another instance is running. */
  tryAcquire(): boolean {
    try {
      this.fd = fs.openSync(this.lockPath, "wx"); // wx = write, fail if exists
      fs.writeSync(this.fd, String(process.pid));
      return true;
    } catch {
      return false;
    }
  }

  /** Release the lock. */
  release(): void {
    if (this.fd !== undefined) {
      try { fs.closeSync(this.fd); } catch { /* ignore */ }
      this.fd = undefined;
    }
    try { fs.unlinkSync(this.lockPath); } catch { /* ignore */ }
  }
}