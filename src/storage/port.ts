/**
 * StoragePort — the swappable storage seam.
 *
 * [HARD] §9: The Query Engine sees only ReadStoragePort. The indexer sees
 * the full StoragePort. A Neo4j adapter later implements the same interface;
 * nothing else changes.
 *
 * Every method returns Result<T, BrainError> (§8.2). No exceptions for
 * expected conditions. Internal rowids never cross this boundary — only
 * relativePath and symbolId (§6.2).
 */

import type { Result } from "../domain/result.ts";
import type { BrainError } from "../domain/errors.ts";
import type { Component } from "../domain/component.ts";
import type { Edge } from "../domain/edge.ts";
import type { FileIndex } from "../domain/file-index.ts";
import type { Reference } from "../domain/reference.ts";
import type { Route } from "../domain/route.ts";
import type { Symbol } from "../domain/symbol.ts";
import type {
  FileRecord,
  FreshnessSnapshot,
  SymbolFilter,
} from "./records.ts";

// ---- Read-only port (what the Query Engine sees) ----

export interface ReadStoragePort {
  // ---- Files ----

  /** Get a single file by its stable relative path. */
  getFile(relativePath: string): Promise<Result<FileRecord | null, BrainError>>;

  /** List all files tracked in the index. */
  getFiles(): Promise<Result<readonly FileRecord[], BrainError>>;

  // ---- Symbols ----

  /** Get all symbols defined in a file. */
  getSymbolsInFile(relativePath: string): Promise<Result<readonly Symbol[], BrainError>>;

  /** Get a single symbol by its stable identifier. */
  getSymbol(symbolId: string): Promise<Result<Symbol | null, BrainError>>;

  /** Query symbols by name, kind, file, or exported status. */
  querySymbols(filter: SymbolFilter): Promise<Result<readonly Symbol[], BrainError>>;

  // ---- References ----

  /**
   * Resolve a reference specifier (raw import string) to a symbolId.
   * Returns null if the reference cannot be resolved yet (lazy identity §6.1).
   */
  resolveReference(specifier: string, fromFile: string): Promise<Result<string | null, BrainError>>;

  /** Get all references in a file. */
  getReferencesInFile(relativePath: string): Promise<Result<readonly Reference[], BrainError>>;

  // ---- Edges ----

  /** Get all edges where this symbol is the source. */
  getOutgoingEdges(symbolId: string): Promise<Result<readonly Edge[], BrainError>>;

  /** Get all edges where this symbol is the target. */
  getIncomingEdges(symbolId: string): Promise<Result<readonly Edge[], BrainError>>;

  // ---- Components ----

  /** Get a component by its symbol id. */
  getComponent(symbolId: string): Promise<Result<Component | null, BrainError>>;

  /** List all indexed components. */
  getComponents(): Promise<Result<readonly Component[], BrainError>>;

  // ---- Routes ----

  /** Get a route by its symbol id, if associated. */
  getRoute(symbolId: string): Promise<Result<Route | null, BrainError>>;

  /** List all indexed routes. */
  getRoutes(): Promise<Result<readonly Route[], BrainError>>;

  // ---- Freshness ----

  /** Get the freshness snapshot (last indexed time + schema version). */
  getFreshness(): Promise<Result<FreshnessSnapshot, BrainError>>;

  /** Count the total number of tracked files. */
  countFiles(): Promise<Result<number, BrainError>>;

  /** Count the total number of indexed symbols. */
  countSymbols(): Promise<Result<number, BrainError>>;

  // ---- Transactions (read-only) ----

  /**
   * Execute a function inside a read transaction. The function receives the
   * same ReadStoragePort (query methods only). The adapter owns begin/rollback.
   */
  txRead<T>(fn: (port: ReadStoragePort) => Promise<T>): Promise<Result<T, BrainError>>;
}

// ---- Full storage port (what the Indexer sees) ----

export interface StoragePort extends ReadStoragePort {
  // ---- Writes ----

  /**
   * Upsert a parsed file's data.
   *
   * [HARD] §5.3 / §6.4: Per-file delete-then-insert within one transaction.
   * Cascade-deletes all existing rows for this file, then inserts fresh ones
   * from the FileIndex. A failure rolls back to the previous state.
   */
  upsertFile(index: FileIndex): Promise<Result<void, BrainError>>;

  /**
   * Delete all data for a file by its stable relative path.
   * No-op if the file is not tracked.
   */
  deleteFile(relativePath: string): Promise<Result<void, BrainError>>;

  /**
   * Update the parse state of a file (e.g. mark as quarantined after a
   * failed parse). Does not touch symbols/references/edges — just the
   * file-level metadata.
   */
  markFileState(
    relativePath: string,
    parseState: FileRecord["parseState"],
    error?: string,
  ): Promise<Result<void, BrainError>>;

  // ---- Schema ----

  /**
   * Run all pending forward-only migrations.
   * [HARD] §6.5: Runs inside a single transaction; failure aborts startup.
   */
  runMigrations(): Promise<Result<void, BrainError>>;

  /**
   * Get the current schema migration version.
   */
  getSchemaVersion(): Promise<Result<number, BrainError>>;

  // ---- Transactions (read-write) ----

  /**
   * Execute a function inside a read-write transaction. The function receives
   * the full StoragePort. The adapter owns begin/commit/rollback.
   * If the function throws (bug), the transaction is rolled back.
   */
  txWrite<T>(fn: (port: StoragePort) => Promise<T>): Promise<Result<T, BrainError>>;
}