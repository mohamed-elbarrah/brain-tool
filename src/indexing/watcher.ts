/**
 * File watcher — uses chokidar to monitor a project directory and feed
 * events into the IndexQueue.
 *
 * [HARD] §7.3 / §14: Uses chokidar. Renames are handled by chokidar's
 * `unlink` + `add` events (sequenced correctly by the queue). Ignores
 * `.brain/`, `node_modules/`, `.git/`, and common generated dirs.
 */

import chokidar from "chokidar";
import type { IndexQueue } from "./queue.ts";

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.brain/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.cache/**",
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "**/yarn.lock",
];

export interface WatcherOptions {
  /** Absolute path to the project root. */
  rootPath: string;
  /** Glob patterns to ignore (merged with defaults). */
  ignore?: readonly string[];
  /** File extensions to watch. Defaults to .ts/.tsx. */
  extensions?: readonly string[];
}

export class FileWatcher {
  private watcher: any;
  private queue: IndexQueue;

  constructor(queue: IndexQueue) {
    this.queue = queue;
  }

  /**
   * Start watching. Returns a promise that resolves when the initial scan
   * is complete (chokidar's `ready` event). This is the right time to
   * begin processing queued files.
   */
  async start(options: WatcherOptions): Promise<void> {
    const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];
    const exts = options.extensions ?? [".ts", ".tsx"];
    const pattern = `**/*{${exts.join(",")}}`;

    return new Promise((resolve) => {
      this.watcher = chokidar.watch(pattern, {
        cwd: options.rootPath,
        ignored: ignore,
        persistent: true,
        ignoreInitial: false,
        ignorePermissionErrors: true,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100,
        },
      });

      this.watcher
        .on("add", (path: string) => {
          this.queue.enqueue({ kind: "add", path });
        })
        .on("change", (path: string) => {
          this.queue.enqueue({ kind: "change", path });
        })
        .on("unlink", (path: string) => {
          this.queue.enqueue({ kind: "delete", path });
        })
        .on("ready", () => {
          resolve();
        })
        .on("error", (err: Error) => {
          console.error("FileWatcher error:", err.message);
        });
    });
  }

  /** Stop watching and release resources. */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
  }
}