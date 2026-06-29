/**
 * Migration 001 — Initial schema.
 *
 * Creates all 10 tables with foreign keys, cascading deletes, indexes, and
 * WAL-friendly settings. Forward-only (§6.5).
 */

export const VERSION = 1;

export const UP = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version   INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  path           TEXT NOT NULL UNIQUE,
  language       TEXT NOT NULL,
  mtime          INTEGER NOT NULL,
  hash           TEXT NOT NULL,
  parse_state    TEXT NOT NULL DEFAULT 'ok',
  error          TEXT,
  last_indexed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS symbols (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id         INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  symbol_id       TEXT NOT NULL,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  local_name      TEXT NOT NULL,
  exported        INTEGER NOT NULL DEFAULT 0,
  start_line      INTEGER NOT NULL,
  start_column    INTEGER NOT NULL,
  end_line        INTEGER,
  end_column      INTEGER,
  start_offset    INTEGER,
  end_offset      INTEGER,
  signature       TEXT NOT NULL,
  signature_hash  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_symbols_symbol_id ON symbols(symbol_id);
CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);

CREATE TABLE IF NOT EXISTS symbol_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id   INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  "order"     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_symbol_members_symbol_id ON symbol_members(symbol_id);

CREATE TABLE IF NOT EXISTS references_ (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id           INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  specifier         TEXT NOT NULL,
  target_file_hint  TEXT,
  target_symbol_id  TEXT,
  start_line        INTEGER NOT NULL,
  start_column      INTEGER NOT NULL,
  end_line          INTEGER,
  end_column        INTEGER,
  start_offset      INTEGER,
  end_offset        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_references_file_id ON references_(file_id);
CREATE INDEX IF NOT EXISTS idx_references_target ON references_(target_symbol_id);

CREATE TABLE IF NOT EXISTS edges (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source_symbol_id      TEXT NOT NULL,
  kind                  TEXT NOT NULL,
  target_symbol_id      TEXT,
  target_reference_id   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_symbol_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_symbol_id);

CREATE TABLE IF NOT EXISTS components (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id       TEXT NOT NULL UNIQUE,
  props           TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS component_imports (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  component_symbol_id   TEXT NOT NULL,
  imported_symbol_id    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_component_imports_component ON component_imports(component_symbol_id);

CREATE TABLE IF NOT EXISTS routes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id             TEXT,
  path                  TEXT NOT NULL,
  method                TEXT NOT NULL,
  controller_symbol_id  TEXT
);

CREATE INDEX IF NOT EXISTS idx_routes_path ON routes(path);

CREATE TABLE IF NOT EXISTS knowledge_port (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  type  TEXT NOT NULL,
  data  TEXT NOT NULL
);
`.trim();

export const DOWN = `
DROP TABLE IF EXISTS knowledge_port;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS component_imports;
DROP TABLE IF EXISTS components;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS references_;
DROP TABLE IF EXISTS symbol_members;
DROP TABLE IF EXISTS symbols;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS schema_migrations;
`.trim();