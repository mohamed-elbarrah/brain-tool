/**
 * InMemoryStorageAdapter tests — proves the swap seam works.
 *
 * These tests verify the same operations that the SQLite adapter test
 * covers, but running against Maps instead of SQLite. This proves
 * the StoragePort seam is real and that the indexing/query layers
 * never depend on the concrete database.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { InMemoryStorageAdapter } from "./adapter.ts";
import type { FileIndex } from "../../domain/file-index.ts";

function makeFileIndex(overrides?: Partial<FileIndex>): FileIndex {
  return {
    relativePath: "src/test.ts",
    language: "typescript",
    mtime: 1000,
    hash: "abc123",
    parseState: "ok",
    error: undefined,
    symbols: [],
    members: [],
    references: [],
    edges: [],
    components: [],
    routes: [],
    ...overrides,
  };
}

describe("InMemoryStorageAdapter", () => {
  it("returns version 0 before migrations", async () => {
    const a = new InMemoryStorageAdapter();
    const r = await a.getSchemaVersion();
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.value, 0);
  });

  it("runMigrations sets version to 1", async () => {
    const a = new InMemoryStorageAdapter();
    const r1 = await a.runMigrations();
    assert.strictEqual(r1.ok, true);
    const r2 = await a.getSchemaVersion();
    assert.strictEqual(r2.ok, true);
    if (r2.ok) assert.strictEqual(r2.value, 1);
  });

  it("is idempotent — multiple runMigrations calls", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();
    await a.runMigrations();
    const r = await a.getSchemaVersion();
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.value, 1);
  });

  it("upserts a file and retrieves it", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();

    const idx = makeFileIndex();
    const up = await a.upsertFile(idx);
    assert.strictEqual(up.ok, true);

    const gf = await a.getFile("src/test.ts");
    assert.strictEqual(gf.ok, true);
    if (gf.ok && gf.value) {
      assert.strictEqual(gf.value.relativePath, "src/test.ts");
      assert.strictEqual(gf.value.language, "typescript");
      assert.strictEqual(gf.value.mtime, 1000);
      assert.strictEqual(gf.value.parseState, "ok");
    }
  });

  it("upsertFile is idempotent", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();

    const idx = makeFileIndex();
    await a.upsertFile(idx);
    await a.upsertFile(idx);

    const cf = await a.countFiles();
    assert.strictEqual(cf.ok, true);
    if (cf.ok) assert.strictEqual(cf.value, 1);
  });

  it("deletes a file", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();

    const idx = makeFileIndex({
      symbols: [
        {
          symbolId: "test_fn",
          relativePath: "src/test.ts",
          name: "testFn",
          localName: "testFn",
          kind: "function",
          exported: true,
          location: { startLine: 1, startColumn: 1, endLine: undefined, endColumn: undefined, startOffset: undefined, endOffset: undefined },
          signature: "() => void",
          signatureHash: "sig_hash",
        },
      ],
    });
    await a.upsertFile(idx);

    const cs1 = await a.countSymbols();
    assert.strictEqual(cs1.ok, true);
    if (cs1.ok) assert.strictEqual(cs1.value, 1);

    const del = await a.deleteFile("src/test.ts");
    assert.strictEqual(del.ok, true);

    const gf = await a.getFile("src/test.ts");
    assert.strictEqual(gf.ok, true);
    if (gf.ok) assert.strictEqual(gf.value, null);

    const cs2 = await a.countSymbols();
    assert.strictEqual(cs2.ok, true);
    if (cs2.ok) assert.strictEqual(cs2.value, 0);
  });

  it("countFiles and countSymbols", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();

    await a.upsertFile(makeFileIndex({ relativePath: "src/a.ts" }));
    await a.upsertFile(makeFileIndex({ relativePath: "src/b.ts" }));

    const cf = await a.countFiles();
    assert.strictEqual(cf.ok, true);
    if (cf.ok) assert.strictEqual(cf.value, 2);

    const cs = await a.countSymbols();
    assert.strictEqual(cs.ok, true);
    if (cs.ok) assert.strictEqual(cs.value, 0);
  });

  it("querySymbols filters by name", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();

    await a.upsertFile(makeFileIndex({
      relativePath: "src/app.ts",
      symbols: [
        {
          symbolId: "fn_hello",
          relativePath: "src/app.ts",
          name: "hello",
          localName: "hello",
          kind: "function",
          exported: true,
          location: { startLine: 1, startColumn: 1, endLine: undefined, endColumn: undefined, startOffset: undefined, endOffset: undefined },
          signature: "() => string",
          signatureHash: "h1",
        },
        {
          symbolId: "fn_world",
          relativePath: "src/app.ts",
          name: "world",
          localName: "world",
          kind: "function",
          exported: false,
          location: { startLine: 5, startColumn: 1, endLine: undefined, endColumn: undefined, startOffset: undefined, endOffset: undefined },
          signature: "() => void",
          signatureHash: "h2",
        },
      ],
    }));

    const r = await a.querySymbols({ name: "hello" });
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.value.length, 1);
  });

  it("getFreshness returns non-zero after indexing", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();
    await a.upsertFile(makeFileIndex());

    const f = await a.getFreshness();
    assert.strictEqual(f.ok, true);
    if (f.ok) {
      assert.ok(f.value.lastIndexed > 0);
      assert.strictEqual(f.value.indexVersion, 1);
    }
  });

  it("txRead works", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();
    await a.upsertFile(makeFileIndex());

    const r = await a.txRead(async (port) => {
      const file = await port.getFile("src/test.ts");
      return file;
    });
    assert.strictEqual(r.ok, true);
  });

  it("txWrite commits changes atomically", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();

    const r = await a.txWrite(async (port) => {
      await port.upsertFile(makeFileIndex({ relativePath: "src/atomic.ts" }));
      return "done";
    });
    assert.strictEqual(r.ok, true);

    const gf = await a.getFile("src/atomic.ts");
    assert.strictEqual(gf.ok, true);
    if (gf.ok) assert.ok(gf.value !== null);
  });

  it("markFileState updates parse state", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();
    await a.upsertFile(makeFileIndex());

    const ms = await a.markFileState("src/test.ts", "quarantined", "parse error");
    assert.strictEqual(ms.ok, true);

    const gf = await a.getFile("src/test.ts");
    assert.strictEqual(gf.ok, true);
    if (gf.ok && gf.value) {
      assert.strictEqual(gf.value.parseState, "quarantined");
      assert.strictEqual(gf.value.error, "parse error");
    }
  });

  it("markFileState on non-existent file errors", async () => {
    const a = new InMemoryStorageAdapter();
    const r = await a.markFileState("src/no-such.ts", "ok");
    assert.strictEqual(r.ok, false);
  });

  it("clear resets all state", async () => {
    const a = new InMemoryStorageAdapter();
    await a.runMigrations();
    await a.upsertFile(makeFileIndex());
    a.clear();

    const cf = await a.countFiles();
    assert.strictEqual(cf.ok, true);
    if (cf.ok) assert.strictEqual(cf.value, 0);

    const v = await a.getSchemaVersion();
    assert.strictEqual(v.ok, true);
    if (v.ok) assert.strictEqual(v.value, 0);
  });
});