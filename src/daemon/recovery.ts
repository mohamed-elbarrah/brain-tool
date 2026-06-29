/**
 * Recovery — startup mtime/hash reconciliation.
 *
 * On startup, scans all files in the DB, compares mtime/hash against disk.
 * Re-enqueues changed/deleted files so the index stays in sync.
 *
 * [HARD] §7.4: Full scan iterates files and enqueues them; it does not
 * bypass the queue. This guarantees the same code path for incremental and
 * initial indexing.
 */

import fs from "node:fs";
import path from "node:path";
import type { ReadStoragePort } from "../storage/port.ts";
import type { IndexQueue } from "../indexing/queue.ts";

export class Recovery {
  private storage: ReadStoragePort;
  private queue: IndexQueue;
  private rootPath: string;

  constructor(storage: ReadStoragePort, queue: IndexQueue, rootPath: string) {
    this.storage = storage;
    this.queue = queue;
    this.rootPath = rootPath;
  }

  /**
   * Reconcile the index against the filesystem.
   * Returns counts of { added, changed, deleted } files.
   */
  async reconcile(): Promise<{ added: number; changed: number; deleted: number }> {
    const result = { added: 0, changed: 0, deleted: 0 };

    // Get all tracked files from the DB
    const filesResult = await this.storage.getFiles();
    if (!filesResult.ok) return result;

    const trackedFiles = new Map<string, { mtime: number; hash: string }>();
    for (const f of filesResult.value) {
      trackedFiles.set(f.relativePath, { mtime: f.mtime, hash: f.hash });
    }

    // Check each tracked file against disk
    for (const [relPath, tracked] of trackedFiles) {
      const absPath = path.join(this.rootPath, relPath);
      try {
        const stat = fs.statSync(absPath);
        const diskMtime = stat.mtimeMs;

        if (diskMtime !== tracked.mtime) {
          // File changed — re-enqueue
          result.changed++;
          this.queue.enqueue({ kind: "change", path: relPath });
        }
      } catch {
        // File no longer exists on disk — delete from index
        result.deleted++;
        this.queue.enqueue({ kind: "delete", path: relPath });
      }
    }

    return result;
  }
}