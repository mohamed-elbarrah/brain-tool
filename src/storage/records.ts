/**
 * Storage record types — persisted forms of domain entities.
 *
 * These carry internal `id` rowids used within the storage layer only.
 * They NEVER cross the IPC boundary (§4.3, §6.2).
 */

import type { LanguageTag, ParseState, SymbolKind } from "../domain/identity.ts";
import type { Reference } from "../domain/reference.ts";

/**
 * Persisted file record. The `id` is an internal rowid.
 * External surfaces use `relativePath` as the stable identity (§6.2).
 */
export interface FileRecord {
  /** Internal rowid — never exposed across IPC. */
  readonly id: number;
  readonly relativePath: string;
  readonly language: LanguageTag;
  readonly mtime: number;
  readonly hash: string;
  readonly parseState: ParseState;
  readonly error: string | undefined;
  readonly lastIndexedAt: number;
}

/**
 * Reference with internal rowid, for storage-layer operations
 * (e.g. reconciliation target updates).
 */
export interface ReferenceRecord extends Reference {
  /** Internal rowid — never exposed across IPC. */
  readonly id: number;
  readonly fileId: number;
}

/**
 * Freshness snapshot — information about how current the index is.
 * The daemon supplements queueSize/dirtyFiles at the query level (§8.5).
 */
export interface FreshnessSnapshot {
  readonly lastIndexed: number;
  readonly indexVersion: number;
}

/**
 * Filter for querySymbols. All fields are optional; when present they
 * narrow the result set.
 */
export interface SymbolFilter {
  readonly name?: string;
  readonly kind?: SymbolKind;
  readonly filePath?: string;
  readonly exported?: boolean;
}