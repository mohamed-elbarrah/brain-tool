/**
 * SqliteStorageAdapter — the only writer; concrete StoragePort implementation.
 *
 * [HARD] §5.3: better-sqlite3 imported only inside this file.
 * [HARD] §5.5: WAL, synchronous=NORMAL, busy_timeout.
 * [HARD] §6.4: Every write is transactional; delete-then-insert per file.
 * [HARD] §9: Implements StoragePort; the daemon depends on the port, not this.
 */

import Database from "better-sqlite3";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";
import { brainError } from "../../domain/errors.ts";
import type { BrainError } from "../../domain/errors.ts";
import type { Component } from "../../domain/component.ts";
import type { Edge } from "../../domain/edge.ts";
import type { FileIndex } from "../../domain/file-index.ts";
import type { Reference } from "../../domain/reference.ts";
import type { Route } from "../../domain/route.ts";
import type { Symbol } from "../../domain/symbol.ts";
import { makeLocation } from "../../domain/location.ts";
import type { ReadStoragePort, StoragePort } from "../port.ts";
import type { FileRecord, FreshnessSnapshot, SymbolFilter } from "../records.ts";
import { MIGRATIONS } from "./schema.ts";
import { prepareStatements } from "./statements.ts";

type Stmts = Record<string, any>;

interface FileRow { id: number; path: string; language: string; mtime: number; hash: string; parse_state: string; error: string | null; last_indexed_at: number }
interface SymRow { id: number; file_id: number; symbol_id: string; name: string; kind: string; local_name: string; exported: number; start_line: number; start_column: number; end_line: number | null; end_column: number | null; start_offset: number | null; end_offset: number | null; signature: string; signature_hash: string; path?: string }
interface RefRow { id: number; file_id: number; kind: string; specifier: string; target_file_hint: string | null; target_symbol_id: string | null; start_line: number; start_column: number; end_line: number | null; end_column: number | null; start_offset: number | null; end_offset: number | null; path?: string }
interface EdgeRow { id: number; source_symbol_id: string; kind: string; target_symbol_id: string | null; target_reference_id: number | null }
interface CompRow { id: number; symbol_id: string; props: string }
interface RouteRow { id: number; symbol_id: string | null; path: string; method: string; controller_symbol_id: string | null }

function toFile(r: FileRow): FileRecord {
  return { id: r.id, relativePath: r.path, language: r.language as FileRecord["language"], mtime: r.mtime, hash: r.hash, parseState: r.parse_state as FileRecord["parseState"], error: r.error ?? undefined, lastIndexedAt: r.last_indexed_at };
}
function toSym(r: SymRow, relativePath: string): Symbol {
  return { symbolId: r.symbol_id, relativePath, name: r.name, localName: r.local_name, kind: r.kind as Symbol["kind"], exported: r.exported === 1, location: makeLocation(r.start_line, r.start_column, r.end_line ?? undefined, r.end_column ?? undefined, r.start_offset ?? undefined, r.end_offset ?? undefined), signature: r.signature, signatureHash: r.signature_hash };
}
function toRef(r: RefRow, relativePath: string): Reference {
  return { relativePath, kind: r.kind as Reference["kind"], specifier: r.specifier, targetFileHint: r.target_file_hint ?? undefined, targetSymbolId: r.target_symbol_id ?? undefined, location: makeLocation(r.start_line, r.start_column, r.end_line ?? undefined, r.end_column ?? undefined, r.start_offset ?? undefined, r.end_offset ?? undefined) };
}
function toEdge(r: EdgeRow): Edge {
  return { sourceSymbolId: r.source_symbol_id, kind: r.kind as Edge["kind"], targetSymbolId: r.target_symbol_id ?? undefined, targetReferenceId: r.target_reference_id ?? undefined };
}
function toComp(r: CompRow, importedIds?: readonly string[]): Component {
  let props: Record<string, unknown> = {};
  try { props = JSON.parse(r.props) as Record<string, unknown>; } catch { /* ignore */ }
  return { symbolId: r.symbol_id, props, importedComponentSymbolIds: importedIds ?? [] };
}
function toRoute(r: RouteRow): Route {
  return { symbolId: r.symbol_id ?? undefined, relativePath: undefined, path: r.path, method: r.method, controllerSymbolId: r.controller_symbol_id ?? undefined };
}

export class SqliteStorageAdapter implements StoragePort {
  private db: Database.Database;
  private stmts: Stmts | undefined;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("temp_store = MEMORY");
    this.db.pragma("foreign_keys = ON");
    // Bootstrap schema_migrations before any statements compile.
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
    this.stmts = undefined;
  }

  private getStmts(): Stmts {
    if (!this.stmts) {
      this.stmts = prepareStatements(this.db);
    }
    return this.stmts;
  }

  close(): void { this.db.close(); }

  // ---- Files ----

  async getFile(relativePath: string): Promise<Result<FileRecord | null, BrainError>> {
    try {
      const r = this.getStmts().getFile.get(relativePath) as FileRow | undefined;
      return ok(r ? toFile(r) : null);
    } catch (e) { return err(brainError("Internal", "Failed to get file", e)); }
  }

  async getFiles(): Promise<Result<readonly FileRecord[], BrainError>> {
    try {
      return ok((this.getStmts().getFiles.all() as FileRow[]).map(toFile));
    } catch (e) { return err(brainError("Internal", "Failed to list files", e)); }
  }

  // ---- Symbols ----

  async getSymbolsInFile(relativePath: string): Promise<Result<readonly Symbol[], BrainError>> {
    try {
      return ok((this.getStmts().getSymbolsInFile.all(relativePath) as SymRow[]).map((r) => toSym(r, relativePath)));
    } catch (e) { return err(brainError("Internal", "Failed to get symbols", e)); }
  }

  async getSymbol(symbolId: string): Promise<Result<Symbol | null, BrainError>> {
    try {
      const r = this.getStmts().getSymbol.get(symbolId) as (SymRow & { path: string }) | undefined;
      if (!r) return ok(null);
      return ok(toSym(r, r.path));
    } catch (e) { return err(brainError("Internal", "Failed to get symbol", e)); }
  }

  async querySymbols(filter: SymbolFilter): Promise<Result<readonly Symbol[], BrainError>> {
    try {
      const rows = this.getStmts().querySymbols.all(
        filter.name ?? null, filter.name ?? null,
        filter.kind ?? null, filter.kind ?? null,
        filter.filePath ?? null, filter.filePath ?? null,
        filter.exported === undefined ? null : (filter.exported ? 1 : 0),
        filter.exported === undefined ? null : (filter.exported ? 1 : 0),
      ) as (SymRow & { path: string })[];
      return ok(rows.map((r) => toSym(r, r.path)));
    } catch (e) { return err(brainError("Internal", "Failed to query symbols", e)); }
  }

  // ---- References ----

  async resolveReference(specifier: string, fromFile: string): Promise<Result<string | null, BrainError>> {
    try {
      const r = this.getStmts().resolveReference.get(specifier, fromFile) as { symbol_id: string } | undefined;
      return ok(r?.symbol_id ?? null);
    } catch (e) { return err(brainError("Internal", "Failed to resolve reference", e)); }
  }

  async getReferencesInFile(relativePath: string): Promise<Result<readonly Reference[], BrainError>> {
    try {
      const rows = this.getStmts().getReferencesInFile.all(relativePath) as (RefRow & { path: string })[];
      return ok(rows.map((r) => toRef(r, r.path)));
    } catch (e) { return err(brainError("Internal", "Failed to get references", e)); }
  }

  // ---- Edges ----

  async getOutgoingEdges(symbolId: string): Promise<Result<readonly Edge[], BrainError>> {
    try {
      return ok((this.getStmts().getOutgoingEdges.all(symbolId) as EdgeRow[]).map(toEdge));
    } catch (e) { return err(brainError("Internal", "Failed to get outgoing edges", e)); }
  }

  async getIncomingEdges(symbolId: string): Promise<Result<readonly Edge[], BrainError>> {
    try {
      return ok((this.getStmts().getIncomingEdges.all(symbolId) as EdgeRow[]).map(toEdge));
    } catch (e) { return err(brainError("Internal", "Failed to get incoming edges", e)); }
  }

  // ---- Components ----

  async getComponent(symbolId: string): Promise<Result<Component | null, BrainError>> {
    try {
      const r = this.getStmts().getComponent.get(symbolId) as CompRow | undefined;
      if (!r) return ok(null);
      const imports = this.db.prepare("SELECT imported_symbol_id FROM component_imports WHERE component_symbol_id = ?").all(symbolId) as { imported_symbol_id: string }[];
      return ok(toComp(r, imports.map((i) => i.imported_symbol_id)));
    } catch (e) { return err(brainError("Internal", "Failed to get component", e)); }
  }

  async getComponents(): Promise<Result<readonly Component[], BrainError>> {
    try {
      const rows = this.getStmts().getComponents.all() as CompRow[];
      return ok(rows.map((r) => {
        const imports = this.db.prepare("SELECT imported_symbol_id FROM component_imports WHERE component_symbol_id = ?").all(r.symbol_id) as { imported_symbol_id: string }[];
        return toComp(r, imports.map((i) => i.imported_symbol_id));
      }));
    } catch (e) { return err(brainError("Internal", "Failed to list components", e)); }
  }

  // ---- Routes ----

  async getRoute(symbolId: string): Promise<Result<Route | null, BrainError>> {
    try {
      const r = this.getStmts().getRoute.get(symbolId) as RouteRow | undefined;
      return ok(r ? toRoute(r) : null);
    } catch (e) { return err(brainError("Internal", "Failed to get route", e)); }
  }

  async getRoutes(): Promise<Result<readonly Route[], BrainError>> {
    try {
      return ok((this.getStmts().getRoutes.all() as RouteRow[]).map(toRoute));
    } catch (e) { return err(brainError("Internal", "Failed to list routes", e)); }
  }

  // ---- Freshness ----

  async getFreshness(): Promise<Result<FreshnessSnapshot, BrainError>> {
    try {
      const li = this.getStmts().getLastIndexed.get() as { v: number | null } | undefined;
      const sv = this.getStmts().getSchemaVersion.get() as { v: number | null } | undefined;
      return ok({ lastIndexed: li?.v ?? 0, indexVersion: sv?.v ?? 0 });
    } catch (e) { return err(brainError("Internal", "Failed to get freshness", e)); }
  }

  async countFiles(): Promise<Result<number, BrainError>> {
    try { return ok((this.getStmts().countFiles.get() as { c: number }).c); } catch (e) { return err(brainError("Internal", "Failed to count files", e)); }
  }
  async countSymbols(): Promise<Result<number, BrainError>> {
    try { return ok((this.getStmts().countSymbols.get() as { c: number }).c); } catch (e) { return err(brainError("Internal", "Failed to count symbols", e)); }
  }

  // ---- Transactions ----

  async txRead<T>(fn: (port: ReadStoragePort) => Promise<T>): Promise<Result<T, BrainError>> {
    try { return ok(await fn(this)); } catch (e) { return err(brainError("Internal", "Read transaction failed", e)); }
  }

  async txWrite<T>(fn: (port: StoragePort) => Promise<T>): Promise<Result<T, BrainError>> {
    try {
      this.db.exec("BEGIN IMMEDIATE");
      const value = await fn(this);
      this.db.exec("COMMIT");
      return ok(value);
    } catch (e) {
      try { this.db.exec("ROLLBACK"); } catch { /* ignore */ }
      return err(brainError("Internal", "Write transaction failed", e));
    }
  }

  // ---- Writes ----

  async upsertFile(index: FileIndex): Promise<Result<void, BrainError>> {
    const savepoint = "brain_upsert";
    try {
      this.db.exec(`SAVEPOINT ${savepoint}`);

      // Collect old symbol_ids before deleting
      const existing = this.getStmts().getFile.get(index.relativePath) as FileRow | undefined;
      const oldSyms: string[] = [];
      if (existing) {
        for (const s of this.db.prepare("SELECT symbol_id FROM symbols WHERE file_id = ?").all(existing.id) as { symbol_id: string }[]) {
          oldSyms.push(s.symbol_id);
        }
      }

      // Delete old file + cascade symbols, members, refs
      this.getStmts().deleteFile.run(index.relativePath);
      if (oldSyms.length > 0) {
        const ph = oldSyms.map(() => "?").join(",");
        this.db.prepare(`DELETE FROM edges WHERE source_symbol_id IN (${ph})`).run(...oldSyms);
      }

      // Insert file
      const now = Date.now();
      this.getStmts().insertFile.run({ path: index.relativePath, language: index.language, mtime: index.mtime, hash: index.hash, parseState: index.parseState, error: index.error ?? null, lastIndexedAt: now });
      const fileId = (this.getStmts().getFile.get(index.relativePath) as FileRow).id;

      // Insert symbols
      for (const sym of index.symbols) {
        this.getStmts().insertSymbol.run({ fileId, symbolId: sym.symbolId, name: sym.name, kind: sym.kind, localName: sym.localName, exported: sym.exported ? 1 : 0, startLine: sym.location.startLine, startColumn: sym.location.startColumn, endLine: sym.location.endLine ?? null, endColumn: sym.location.endColumn ?? null, startOffset: sym.location.startOffset ?? null, endOffset: sym.location.endOffset ?? null, signature: sym.signature, signatureHash: sym.signatureHash });
      }

      // Insert members
      for (const m of index.members) {
        this.getStmts().insertMember.run({ symbolId: m.symbolId, kind: m.kind, name: m.name, type: m.type, order: m.order });
      }

      // Insert references
      for (const ref of index.references) {
        this.getStmts().insertReference.run({ fileId, kind: ref.kind, specifier: ref.specifier, targetFileHint: ref.targetFileHint ?? null, targetSymbolId: ref.targetSymbolId ?? null, startLine: ref.location.startLine, startColumn: ref.location.startColumn, endLine: ref.location.endLine ?? null, endColumn: ref.location.endColumn ?? null, startOffset: ref.location.startOffset ?? null, endOffset: ref.location.endOffset ?? null });
      }

      // Insert edges
      for (const edge of index.edges) {
        this.getStmts().insertEdge.run({ sourceSymbolId: edge.sourceSymbolId, kind: edge.kind, targetSymbolId: edge.targetSymbolId ?? null, targetReferenceId: edge.targetReferenceId ?? null });
      }

      // Insert components
      for (const comp of index.components) {
        this.getStmts().insertComponent.run({ symbolId: comp.symbolId, props: JSON.stringify(comp.props) });
        for (const imp of comp.importedComponentSymbolIds) {
          this.getStmts().insertComponentImport.run({ componentSymbolId: comp.symbolId, importedSymbolId: imp });
        }
      }

      // Insert routes
      for (const route of index.routes) {
        this.getStmts().insertRoute.run({ symbolId: route.symbolId ?? null, path: route.path, method: route.method, controllerSymbolId: route.controllerSymbolId ?? null });
      }

      this.db.exec(`RELEASE ${savepoint}`);
      return ok(undefined);
    } catch (e) {
      try { this.db.exec(`ROLLBACK TO ${savepoint}`); this.db.exec(`RELEASE ${savepoint}`); } catch { /* ignore */ }
      return err(brainError("Internal", "Failed to upsert file", e));
    }
  }

  async deleteFile(relativePath: string): Promise<Result<void, BrainError>> {
    const savepoint = "brain_delete";
    try {
      this.db.exec(`SAVEPOINT ${savepoint}`);
      const existing = this.getStmts().getFile.get(relativePath) as FileRow | undefined;
      if (existing) {
        const ids = (this.db.prepare("SELECT symbol_id FROM symbols WHERE file_id = ?").all(existing.id) as { symbol_id: string }[]).map((s) => s.symbol_id);
        if (ids.length > 0) {
          const ph = ids.map(() => "?").join(",");
          this.db.prepare(`DELETE FROM edges WHERE source_symbol_id IN (${ph})`).run(...ids);
        }
      }
      this.getStmts().deleteFile.run(relativePath);
      this.db.exec(`RELEASE ${savepoint}`);
      return ok(undefined);
    } catch (e) {
      try { this.db.exec(`ROLLBACK TO ${savepoint}`); this.db.exec(`RELEASE ${savepoint}`); } catch { /* ignore */ }
      return err(brainError("Internal", "Failed to delete file", e));
    }
  }

  async markFileState(relativePath: string, parseState: FileRecord["parseState"], error?: string): Promise<Result<void, BrainError>> {
    try {
      this.getStmts().updateFileState.run(parseState, error ?? null, relativePath);
      return ok(undefined);
    } catch (e) { return err(brainError("Internal", "Failed to mark file state", e)); }
  }

  async runMigrations(): Promise<Result<void, BrainError>> {
    try {
      // Use raw queries — getStmts() would fail because tables don't exist yet.
      const row = this.db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null } | undefined;
      const current = row?.v ?? 0;
      for (const m of MIGRATIONS) {
        if (m.version > current) {
          this.db.exec(m.up);
          this.db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(m.version);
        }
      }
      return ok(undefined);
    } catch (e) { return err(brainError("Internal", "Migration failed", e)); }
  }

  async getSchemaVersion(): Promise<Result<number, BrainError>> {
    try {
      const row = this.db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null } | undefined;
      return ok(row?.v ?? 0);
    } catch (e) { return err(brainError("Internal", "Failed to get schema version", e)); }
  }
}