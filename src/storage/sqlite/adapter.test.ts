/**
 * Smoke tests for SqliteStorageAdapter.
 *
 * Uses a temporary database per test. Tests the real SQLite adapter against
 * the StoragePort interface (§9.2 seam proof).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStorageAdapter } from "./adapter.ts";
import type { FileIndex } from "../../domain/file-index.ts";
import { makeLocation } from "../../domain/location.ts";

function tmpDbPath(): string {
  return join(tmpdir(), `brain-test-${randomBytes(4).toString("hex")}.db`);
}

function sampleIndex(relativePath: string): FileIndex {
  return {
    relativePath,
    language: "typescript",
    mtime: 1000,
    hash: "abc",
    parseState: "ok",
    error: undefined,
    symbols: [
      {
        symbolId: `sym_${relativePath.replace(/\//g, "_")}_myFunc`,
        relativePath,
        name: "myFunc",
        localName: "myFunc",
        kind: "function",
        exported: true,
        location: makeLocation(1, 1, 5, 1),
        signature: "(x: number): string",
        signatureHash: "hash_sig_myFunc",
      },
    ],
    members: [],
    references: [
      {
        relativePath,
        kind: "import",
        specifier: "./other",
        location: makeLocation(1, 1, 1, 20),
        targetFileHint: undefined,
        targetSymbolId: undefined,
      },
    ],
    edges: [],
    components: [],
    routes: [],
  };
}

void describe("SqliteStorageAdapter", () => {
  let dbPath: string;
  let adapter: SqliteStorageAdapter;

  before(() => {
    dbPath = tmpDbPath();
    adapter = new SqliteStorageAdapter(dbPath);
  });

  after(() => {
    adapter.close();
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
    try { if (existsSync(`${dbPath}-wal`)) unlinkSync(`${dbPath}-wal`); } catch { /* ignore */ }
    try { if (existsSync(`${dbPath}-shm`)) unlinkSync(`${dbPath}-shm`); } catch { /* ignore */ }
  });

  void it("runs migrations successfully", async () => {
    const result = await adapter.runMigrations();
    assert.equal(result.ok, true);
    const version = await adapter.getSchemaVersion();
    assert.equal(version.ok, true);
    if (version.ok) {
      assert.equal(version.value >= 1, true);
    }
  });

  void it("is idempotent — running migrations twice does not error", async () => {
    const result = await adapter.runMigrations();
    assert.equal(result.ok, true);
  });

  void it("upserts a file and retrieves it", async () => {
    const index = sampleIndex("src/my-file.ts");
    const upsert = await adapter.upsertFile(index);
    assert.equal(upsert.ok, true);

    const file = await adapter.getFile("src/my-file.ts");
    assert.equal(file.ok, true);
    if (file.ok) {
      assert.ok(file.value !== null);
      assert.equal(file.value.relativePath, "src/my-file.ts");
      assert.equal(file.value.language, "typescript");
    }

    const symbols = await adapter.getSymbolsInFile("src/my-file.ts");
    assert.equal(symbols.ok, true);
    if (symbols.ok) {
      assert.equal(symbols.value.length, 1);
      assert.equal(symbols.value[0]!.name, "myFunc");
    }
  });

  void it("upsertFile is idempotent — same file twice produces same state", async () => {
    const index = sampleIndex("src/idempotent.ts");
    const r1 = await adapter.upsertFile(index);
    assert.equal(r1.ok, true);

    const index2 = sampleIndex("src/idempotent.ts");
    const r2 = await adapter.upsertFile(index2);
    assert.equal(r2.ok, true);

    const symbols = await adapter.getSymbolsInFile("src/idempotent.ts");
    assert.equal(symbols.ok, true);
    if (symbols.ok) {
      assert.equal(symbols.value.length, 1);
    }
  });

  void it("deletes a file and removes its symbols", async () => {
    const index = sampleIndex("src/delete-me.ts");
    await adapter.upsertFile(index);

    const del = await adapter.deleteFile("src/delete-me.ts");
    assert.equal(del.ok, true);

    const file = await adapter.getFile("src/delete-me.ts");
    assert.equal(file.ok, true);
    if (file.ok) {
      assert.equal(file.value, null);
    }

    const symbols = await adapter.getSymbolsInFile("src/delete-me.ts");
    assert.equal(symbols.ok, true);
    if (symbols.ok) {
      assert.equal(symbols.value.length, 0);
    }
  });

  void it("countFiles and countSymbols return correct numbers", async () => {
    await adapter.upsertFile(sampleIndex("src/count-a.ts"));
    await adapter.upsertFile(sampleIndex("src/count-b.ts"));

    const counts = await adapter.countFiles();
    assert.equal(counts.ok, true);
    if (counts.ok) {
      assert.ok(counts.value >= 2); // plus files from other tests
    }

    const syms = await adapter.countSymbols();
    assert.equal(syms.ok, true);
    if (syms.ok) {
      assert.ok(syms.value >= 2);
    }
  });

  void it("querySymbols filters by name", async () => {
    const r = await adapter.querySymbols({ name: "myFunc" });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(r.value.length >= 1);
      assert.equal(r.value[0]!.name, "myFunc");
    }
  });

  void it("getFreshness returns non-zero values after indexing", async () => {
    const f = await adapter.getFreshness();
    assert.equal(f.ok, true);
    if (f.ok) {
      assert.ok(f.value.lastIndexed > 0);
    }
  });

  void it("txRead works", async () => {
    const r = await adapter.txRead(async (port) => {
      const files = await port.getFiles();
      assert.equal(files.ok, true);
      return "done";
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value, "done");
    }
  });

  void it("txWrite commits changes atomically", async () => {
    const r = await adapter.txWrite(async (port) => {
      await port.upsertFile(sampleIndex("src/tx-write.ts"));
      return "committed";
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value, "committed");
    }
    const file = await adapter.getFile("src/tx-write.ts");
    assert.equal(file.ok, true);
    if (file.ok) {
      assert.ok(file.value !== null);
    }
  });

  void it("markFileState updates parse state", async () => {
    await adapter.upsertFile(sampleIndex("src/state-test.ts"));
    const r = await adapter.markFileState("src/state-test.ts", "error", "oops");
    assert.equal(r.ok, true);

    const file = await adapter.getFile("src/state-test.ts");
    assert.equal(file.ok, true);
    if (file.ok) {
      assert.equal(file.value?.parseState, "error");
      assert.equal(file.value?.error, "oops");
    }
  });
});