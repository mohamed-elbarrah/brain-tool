/**
 * BrainConfig — configuration types and defaults.
 */

import type { QueryLimits } from "../query/limits.ts";

export interface BrainConfig {
  /** Absolute path to the project root. */
  readonly rootPath: string;
  /** Absolute path to the .brain/ directory. */
  readonly brainDir: string;
  /** Path to the SQLite database file. */
  readonly dbPath: string;
  /** Query limits. */
  readonly limits: QueryLimits;
  /** File extensions to watch. */
  readonly watchExtensions: readonly string[];
  /** Debounce time in ms for the index queue. */
  readonly debounceMs: number;
}

export function defaultConfig(rootPath: string): BrainConfig {
  const brainDir = `${rootPath}/.brain`;
  return {
    rootPath,
    brainDir,
    dbPath: `${brainDir}/brain.db`,
    limits: {
      maxSymbols: 100,
      maxReferences: 200,
      maxEdges: 200,
      maxTraversalDepth: 5,
      maxFiles: 50,
    },
    watchExtensions: [".ts", ".tsx"],
    debounceMs: 150,
  };
}