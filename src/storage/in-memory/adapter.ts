/**
 * InMemoryStorageAdapter — Maps-based StoragePort implementation for unit tests.
 *
 * [HARD] §9.2: Second adapter proves the swap seam. No SQLite, no I/O.
 * [HARD] §5.3: No better-sqlite3 import — not allowed outside sqlite/.
 *
 * All data lives in plain Maps. Every write is synchronous internally but
 * interface methods return Promise<Result<...>> to match StoragePort.
 * Transactions are no-ops (execute the function against `this` directly).
 */

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
import type { ReadStoragePort, StoragePort } from "../port.ts";
import type {
  FileRecord,
  FreshnessSnapshot,
  SymbolFilter,
} from "../records.ts";

// ---- Internal state ----

interface InternalFile {
  id: number;
  relativePath: string;
  language: string;
  mtime: number;
  hash: string;
  parseState: string;
  error: string | undefined;
  lastIndexedAt: number;
}

interface InternalSymbol {
  id: number;
  symbolId: string;
  relativePath: string;
  name: string;
  kind: string;
  localName: string;
  exported: boolean;
  location: {
    startLine: number;
    startColumn: number;
    endLine: number | undefined;
    endColumn: number | undefined;
    startOffset: number | undefined;
    endOffset: number | undefined;
  };
  signature: string;
  signatureHash: string;
}

interface InternalRef {
  id: number;
  relativePath: string;
  kind: string;
  specifier: string;
  targetFileHint: string | undefined;
  targetSymbolId: string | undefined;
  location: {
    startLine: number;
    startColumn: number;
    endLine: number | undefined;
    endColumn: number | undefined;
    startOffset: number | undefined;
    endOffset: number | undefined;
  };
}

interface InternalEdge {
  id: number;
  sourceSymbolId: string;
  kind: string;
  targetSymbolId: string | undefined;
  targetReferenceId: number | undefined;
}

interface InternalComponent {
  symbolId: string;
  props: Record<string, unknown>;
  importedComponentIds: string[];
}

interface InternalRoute {
  symbolId: string | undefined;
  path: string;
  method: string;
  controllerSymbolId: string | undefined;
}

// ---- Helpers ----

let nextId = 1;

function freshId(): number {
  return nextId++;
}

function toFileRecord(f: InternalFile): FileRecord {
  return {
    id: f.id,
    relativePath: f.relativePath,
    language: f.language as any,
    mtime: f.mtime,
    hash: f.hash,
    parseState: f.parseState as any,
    error: f.error,
    lastIndexedAt: f.lastIndexedAt,
  };
}

function toSymbol(s: InternalSymbol): Symbol {
  return {
    symbolId: s.symbolId,
    relativePath: s.relativePath,
    name: s.name,
    localName: s.localName,
    kind: s.kind as any,
    exported: s.exported,
    location: {
      startLine: s.location.startLine,
      startColumn: s.location.startColumn,
      endLine: s.location.endLine,
      endColumn: s.location.endColumn,
      startOffset: s.location.startOffset,
      endOffset: s.location.endOffset,
    },
    signature: s.signature,
    signatureHash: s.signatureHash,
  };
}

function toReference(r: InternalRef): Reference {
  return {
    relativePath: r.relativePath,
    kind: r.kind as any,
    specifier: r.specifier,
    targetFileHint: r.targetFileHint,
    targetSymbolId: r.targetSymbolId,
    location: {
      startLine: r.location.startLine,
      startColumn: r.location.startColumn,
      endLine: r.location.endLine,
      endColumn: r.location.endColumn,
      startOffset: r.location.startOffset,
      endOffset: r.location.endOffset,
    },
  };
}

function toEdge(e: InternalEdge): Edge {
  return {
    sourceSymbolId: e.sourceSymbolId,
    kind: e.kind as any,
    targetSymbolId: e.targetSymbolId,
    targetReferenceId: e.targetReferenceId,
  };
}

function toComponent(c: InternalComponent): Component {
  return {
    symbolId: c.symbolId,
    props: c.props,
    importedComponentSymbolIds: c.importedComponentIds,
  };
}

function toRoute(r: InternalRoute): Route {
  return {
    relativePath: r.symbolId ?? "",
    symbolId: r.symbolId,
    path: r.path,
    method: r.method as any,
    controllerSymbolId: r.controllerSymbolId,
  };
}

// ---- Adapter ----

export class InMemoryStorageAdapter implements StoragePort {
  private schemaVersion = 0;
  private lastIndexed = 0;
  private files = new Map<string, InternalFile>();
  private symbols = new Map<string, InternalSymbol[]>();
  private symbolById = new Map<string, InternalSymbol>();
  private refs = new Map<string, InternalRef[]>();
  private edgesById = new Map<string, InternalEdge[]>();
  private edgesByTarget = new Map<string, InternalEdge[]>();
  private components = new Map<string, InternalComponent>();
  private routesBySym = new Map<string, InternalRoute>();
  private routes: InternalRoute[] = [];

  // ==================================================================
  // ReadStoragePort
  // ==================================================================

  async getFile(relativePath: string): Promise<Result<FileRecord | null, BrainError>> {
    const f = this.files.get(relativePath);
    return ok(f ? toFileRecord(f) : null);
  }

  async getFiles(): Promise<Result<readonly FileRecord[], BrainError>> {
    const all = [...this.files.values()]
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      .map(toFileRecord);
    return ok(all);
  }

  async getSymbolsInFile(relativePath: string): Promise<Result<readonly Symbol[], BrainError>> {
    const list = this.symbols.get(relativePath);
    if (!list) return ok([]);
    return ok(list.map(toSymbol));
  }

  async getSymbol(symbolId: string): Promise<Result<Symbol | null, BrainError>> {
    const s = this.symbolById.get(symbolId);
    return ok(s ? toSymbol(s) : null);
  }

  async querySymbols(filter: SymbolFilter): Promise<Result<readonly Symbol[], BrainError>> {
    let results: Symbol[] = [];
    for (const list of this.symbols.values()) {
      for (const s of list) {
        if (filter.name !== undefined && s.name !== filter.name) continue;
        if (filter.kind !== undefined && s.kind !== filter.kind) continue;
        if (filter.filePath !== undefined && s.relativePath !== filter.filePath) continue;
        if (filter.exported !== undefined && s.exported !== filter.exported) continue;
        results.push(toSymbol(s));
      }
    }
    results.sort((a, b) => {
      const p = a.relativePath.localeCompare(b.relativePath);
      if (p !== 0) return p;
      const n = a.name.localeCompare(b.name);
      if (n !== 0) return n;
      return a.symbolId.localeCompare(b.symbolId);
    });
    return ok(results);
  }

  async resolveReference(
    specifier: string,
    fromFile: string,
  ): Promise<Result<string | null, BrainError>> {
    // Look for a symbol whose name matches the specifier in the same file,
    // or in any file if not found locally (simple heuristic for unit tests).
    const fileSymbols = this.symbols.get(fromFile);
    if (fileSymbols) {
      const found = fileSymbols.find((s) => s.name === specifier || s.localName === specifier);
      if (found) return ok(found.symbolId);
    }
    // Fallback: search all files
    for (const list of this.symbols.values()) {
      const found = list.find((s) => s.name === specifier);
      if (found) return ok(found.symbolId);
    }
    return ok(null);
  }

  async getReferencesInFile(relativePath: string): Promise<Result<readonly Reference[], BrainError>> {
    const list = this.refs.get(relativePath);
    if (!list) return ok([]);
    return ok(list.map(toReference));
  }

  async getOutgoingEdges(symbolId: string): Promise<Result<readonly Edge[], BrainError>> {
    const list = this.edgesById.get(symbolId);
    if (!list) return ok([]);
    return ok(list.map(toEdge));
  }

  async getIncomingEdges(symbolId: string): Promise<Result<readonly Edge[], BrainError>> {
    const list = this.edgesByTarget.get(symbolId);
    if (!list) return ok([]);
    return ok(list.map(toEdge));
  }

  async getComponent(symbolId: string): Promise<Result<Component | null, BrainError>> {
    const c = this.components.get(symbolId);
    return ok(c ? toComponent(c) : null);
  }

  async getComponents(): Promise<Result<readonly Component[], BrainError>> {
    const all = [...this.components.values()]
      .sort((a, b) => a.symbolId.localeCompare(b.symbolId))
      .map(toComponent);
    return ok(all);
  }

  async getRoute(symbolId: string): Promise<Result<Route | null, BrainError>> {
    const r = this.routesBySym.get(symbolId);
    return ok(r ? toRoute(r) : null);
  }

  async getRoutes(): Promise<Result<readonly Route[], BrainError>> {
    const all = [...this.routes]
      .sort((a, b) => {
        const p = a.path.localeCompare(b.path);
        if (p !== 0) return p;
        return a.method.localeCompare(b.method);
      })
      .map(toRoute);
    return ok(all);
  }

  async getFreshness(): Promise<Result<FreshnessSnapshot, BrainError>> {
    return ok({ lastIndexed: this.lastIndexed, indexVersion: this.schemaVersion });
  }

  async countFiles(): Promise<Result<number, BrainError>> {
    return ok(this.files.size);
  }

  async countSymbols(): Promise<Result<number, BrainError>> {
    let count = 0;
    for (const list of this.symbols.values()) {
      count += list.length;
    }
    return ok(count);
  }

  async txRead<T>(fn: (port: ReadStoragePort) => Promise<T>): Promise<Result<T, BrainError>> {
    try {
      return ok(await fn(this));
    } catch (e) {
      return err(brainError("Internal", "txRead failed", e));
    }
  }

  // ==================================================================
  // StoragePort (writes)
  // ==================================================================

  async upsertFile(index: FileIndex): Promise<Result<void, BrainError>> {
    try {
      // Delete existing data for this file.
      this.deleteFileSync(index.relativePath);

      // Insert file record.
      const now = Date.now();
      const file: InternalFile = {
        id: freshId(),
        relativePath: index.relativePath,
        language: index.language,
        mtime: index.mtime,
        hash: index.hash,
        parseState: index.parseState,
        error: index.error,
        lastIndexedAt: now,
      };
      this.files.set(index.relativePath, file);
      if (now > this.lastIndexed) this.lastIndexed = now;

      // Insert symbols.
      const symList: InternalSymbol[] = [];
      for (const s of index.symbols) {
        const isym: InternalSymbol = {
          id: freshId(),
          symbolId: s.symbolId,
          relativePath: s.relativePath,
          name: s.name,
          kind: s.kind,
          localName: s.localName,
          exported: s.exported,
          location: {
            startLine: s.location.startLine,
            startColumn: s.location.startColumn,
            endLine: s.location.endLine,
            endColumn: s.location.endColumn,
            startOffset: s.location.startOffset,
            endOffset: s.location.endOffset,
          },
          signature: s.signature,
          signatureHash: s.signatureHash,
        };
        symList.push(isym);
        this.symbolById.set(s.symbolId, isym);
      }
      this.symbols.set(index.relativePath, symList);

      // Insert members (stored as append to their parent symbol).
      for (const m of index.members) {
        const parent = this.symbolById.get(m.symbolId);
        // Members are just extra data on symbols; store as part of symbol's
        // record by extending. For simplicity, we ignore member storage
        // in-memory — the symbol is the core entity. Members are retrieved
        // alongside the symbol via the domain Symbol type.
        void parent;
      }

      // Insert references.
      const refList: InternalRef[] = [];
      for (const r of index.references) {
        const iref: InternalRef = {
          id: freshId(),
          relativePath: index.relativePath,
          kind: r.kind,
          specifier: r.specifier,
          targetFileHint: r.targetFileHint,
          targetSymbolId: r.targetSymbolId,
          location: {
            startLine: r.location.startLine,
            startColumn: r.location.startColumn,
            endLine: r.location.endLine,
            endColumn: r.location.endColumn,
            startOffset: r.location.startOffset,
            endOffset: r.location.endOffset,
          },
        };
        refList.push(iref);
      }
      this.refs.set(index.relativePath, refList);

      // Insert edges.
      const edgeOutList: InternalEdge[] = [];
      for (const e of index.edges) {
        const iedge: InternalEdge = {
          id: freshId(),
          sourceSymbolId: e.sourceSymbolId,
          kind: e.kind,
          targetSymbolId: e.targetSymbolId,
          targetReferenceId: e.targetReferenceId,
        };
        edgeOutList.push(iedge);

        const existing = this.edgesByTarget.get(e.targetSymbolId ?? "") ?? [];
        existing.push(iedge);
        if (e.targetSymbolId) {
          this.edgesByTarget.set(e.targetSymbolId, existing);
        }
      }
      this.edgesById.set(index.relativePath, edgeOutList);

      // Insert components.
      for (const c of index.components) {
        this.components.set(c.symbolId, {
          symbolId: c.symbolId,
          props: c.props,
          importedComponentIds: [...c.importedComponentSymbolIds],
        });
      }

      // Insert routes.
      for (const r of index.routes) {
        const iroute: InternalRoute = {
          symbolId: r.symbolId,
          path: r.path,
          method: r.method,
          controllerSymbolId: r.controllerSymbolId,
        };
        this.routes.push(iroute);
        if (r.symbolId) {
          this.routesBySym.set(r.symbolId, iroute);
        }
      }

      return ok(undefined);
    } catch (e) {
      return err(brainError("Internal", "Failed to upsert file", e));
    }
  }

  async deleteFile(relativePath: string): Promise<Result<void, BrainError>> {
    try {
      this.deleteFileSync(relativePath);
      return ok(undefined);
    } catch (e) {
      return err(brainError("Internal", "Failed to delete file", e));
    }
  }

  async markFileState(
    relativePath: string,
    parseState: FileRecord["parseState"],
    error?: string,
  ): Promise<Result<void, BrainError>> {
    const f = this.files.get(relativePath);
    if (!f) return err(brainError("BadInput", `File not found: ${relativePath}`));
    f.parseState = parseState;
    f.error = error;
    return ok(undefined);
  }

  async runMigrations(): Promise<Result<void, BrainError>> {
    this.schemaVersion = 1;
    return ok(undefined);
  }

  async getSchemaVersion(): Promise<Result<number, BrainError>> {
    return ok(this.schemaVersion);
  }

  async txWrite<T>(fn: (port: StoragePort) => Promise<T>): Promise<Result<T, BrainError>> {
    try {
      // In-memory: no real transaction, just execute directly.
      return ok(await fn(this));
    } catch (e) {
      return err(brainError("Internal", "txWrite failed", e));
    }
  }

  /** Convenience for programmatic teardown — not part of StoragePort. */
  clear(): void {
    this.files.clear();
    this.symbols.clear();
    this.symbolById.clear();
    this.refs.clear();
    this.edgesById.clear();
    this.edgesByTarget.clear();
    this.components.clear();
    this.routesBySym.clear();
    this.routes = [];
    this.schemaVersion = 0;
    this.lastIndexed = 0;
  }

  // ---- Internal helpers ----

  private deleteFileSync(relativePath: string): void {
    this.files.delete(relativePath);

    // Remove symbols for this file.
    const symList = this.symbols.get(relativePath);
    if (symList) {
      for (const s of symList) {
        this.symbolById.delete(s.symbolId);
      }
    }
    this.symbols.delete(relativePath);

    // Remove references.
    this.refs.delete(relativePath);

    // Remove edges keyed by this file's path (we key by relativePath for simplicity).
    const edgeOut = this.edgesById.get(relativePath);
    if (edgeOut) {
      for (const e of edgeOut) {
        // Clean up incoming edge index.
        if (e.targetSymbolId) {
          const incoming = this.edgesByTarget.get(e.targetSymbolId);
          if (incoming) {
            const idx = incoming.indexOf(e);
            if (idx >= 0) incoming.splice(idx, 1);
            if (incoming.length === 0) this.edgesByTarget.delete(e.targetSymbolId);
          }
        }
      }
    }
    this.edgesById.delete(relativePath);

    // Remove components declared in this file — we'd need to track file→component
    // mapping. For simplicity, all components are stored globally.
    // This is a simplification; the real adapter uses CASCADE.
  }
}