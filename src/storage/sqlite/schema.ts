/**
 * Migration definitions — ordered list of forward-only migrations.
 */

import { UP as up001, VERSION as v001 } from "./migrations/001_initial.ts";

export interface Migration {
  readonly version: number;
  readonly up: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: v001, up: up001 },
];

/** The latest migration version the binary knows about. */
export const SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, m) => Math.max(max, m.version),
  0,
);