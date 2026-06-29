/**
 * Daemon — the composition root that wires everything together.
 *
 * [HARD] §3.1: Owns the DB writer, file watcher, parse queue, IPC server.
 * [HARD] §3.5: Single-instance guarantee via lock file.
 * [HARD] §6.8: Version gate on startup.
 *
 * Lifecycle:
 *   construct → init() → start() → [running] → stop() → [done]
 */

import fs from "node:fs";
import path from "node:path";
import { SqliteStorageAdapter } from "../storage/sqlite/adapter.ts";
import { ParserRegistry } from "../indexing/parser-registry.ts";
import { TypeScriptParser } from "../indexing/parsers/typescript.ts";
import { Pipeline } from "../indexing/pipeline.ts";
import { IndexQueue } from "../indexing/queue.ts";
import { FileWatcher } from "../indexing/watcher.ts";
import { QueryEngine } from "../query/engine.ts";
import { IpcServer } from "../transport/ipc/server.ts";
import { InstanceLock } from "./lock.ts";
import { PidFile } from "./pid.ts";
import { VersionGate } from "./version.ts";
import { Recovery } from "./recovery.ts";
import type { BrainConfig } from "../config/config.ts";

export interface DaemonOptions {
  config: BrainConfig;
  onReady?: () => void;
  onError?: (err: Error) => void;
}

export class Daemon {
  private config: BrainConfig;
  private storage: SqliteStorageAdapter;
  private registry: ParserRegistry;
  private queue: IndexQueue;
  private pipeline: Pipeline;
  private watcher: FileWatcher | undefined;
  private engine: QueryEngine;
  private ipcServer: IpcServer;
  private lock: InstanceLock;
  private pid: PidFile;
  private version: VersionGate;
  private recovery: Recovery;
  private onReady: (() => void) | undefined;
  private onError: ((err: Error) => void) | undefined;
  private running = false;

  constructor(options: DaemonOptions) {
    this.config = options.config;
    this.onReady = options.onReady;
    this.onError = options.onError;

    // Storage
    const dbPath = this.config.dbPath;
    this.storage = new SqliteStorageAdapter(dbPath);

    // Parser
    this.registry = new ParserRegistry();
    this.registry.register(new TypeScriptParser());

    // Queue + Pipeline
    this.queue = new IndexQueue(150);
    this.pipeline = new Pipeline(this.registry, this.storage);
    this.queue.setHandler(async (event) => {
      if (event.kind === "delete") {
        await this.pipeline.deleteFile(event.path);
      } else {
        // Read file from disk and process
        const absPath = path.join(this.config.rootPath, event.path);
        try {
          const source = fs.readFileSync(absPath, "utf-8");
          await this.pipeline.processFile(event.path, source);
        } catch (e: any) {
          this.onError?.(new Error(`Failed to process ${event.path}: ${e.message}`));
        }
      }
    });

    // Query Engine
    this.engine = new QueryEngine(this.storage);

    // IPC Server
    this.ipcServer = new IpcServer(this.engine, {
      brainDir: this.config.brainDir,
    });

    // Daemon utilities
    this.lock = new InstanceLock(this.config.brainDir);
    this.pid = new PidFile(this.config.brainDir);
    this.version = new VersionGate(this.config.brainDir);
    this.recovery = new Recovery(this.storage, this.queue, this.config.rootPath);
  }

  /** Initialize: run migrations, check version, acquire lock. */
  async init(): Promise<void> {
    // Version gate
    const schemaResult = await this.storage.getSchemaVersion();
    if (!schemaResult.ok) throw new Error("Failed to get schema version");

    const versionCheck = this.version.check(schemaResult.value);
    if (versionCheck === "rebuild") {
      throw new Error("Brain format is incompatible. Run `brain rebuild` to recreate the index.");
    }
    if (versionCheck === "downgrade") {
      throw new Error("Brain schema is newer than this binary. Upgrade brain-tool.");
    }

    // Run migrations
    const migrateResult = await this.storage.runMigrations();
    if (!migrateResult.ok) throw new Error("Migration failed");

    // Update version file
    const newSchemaResult = await this.storage.getSchemaVersion();
    if (newSchemaResult.ok) {
      this.version.write(newSchemaResult.value);
    }

    // Acquire lock
    if (!this.lock.tryAcquire()) {
      throw new Error("Another daemon instance is already running.");
    }

    // Write PID
    this.pid.write();
  }

  /** Start the daemon: watcher, IPC server, recovery. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Start IPC server
    const socketPath = await this.ipcServer.start();
    console.error(`Brain daemon listening on ${socketPath}`);

    // Start file watcher
    this.watcher = new FileWatcher(this.queue);
    await this.watcher.start({
      rootPath: this.config.rootPath,
    });

    // Run recovery (reconcile mtime/hash)
    const recResult = await this.recovery.reconcile();
    console.error(`Recovery: ${recResult.changed} changed, ${recResult.deleted} deleted`);

    this.onReady?.();
  }

  /** Graceful shutdown. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // Stop watcher
    if (this.watcher) {
      await this.watcher.stop();
    }

    // Drain queue
    await this.queue.drain();

    // Stop IPC server
    await this.ipcServer.stop();

    // Clean up
    this.lock.release();
    this.pid.remove();
    this.storage.close();
  }
}