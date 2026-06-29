/**
 * End-to-end pipeline test — parse, extract, reconcile, store.
 *
 * Uses the in-memory storage adapter so no SQLite is needed.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { Pipeline } from "./pipeline.ts";
import { ParserRegistry } from "./parser-registry.ts";
import { TypeScriptParser } from "./parsers/typescript.ts";
import { InMemoryStorageAdapter } from "../storage/in-memory/adapter.ts";

describe("Pipeline", () => {
  it("processes a simple function file", async () => {
    const registry = new ParserRegistry();
    registry.register(new TypeScriptParser());
    const storage = new InMemoryStorageAdapter();
    await storage.runMigrations();
    const pipeline = new Pipeline(registry, storage);

    const source = "export function greet(name: string): string { return `Hello ${name}`; }";
    const result = await pipeline.processFile("src/greet.ts", source);
    assert.strictEqual(result.ok, true);

    // Verify the file was stored
    const file = await storage.getFile("src/greet.ts");
    assert.strictEqual(file.ok, true);
    if (file.ok && file.value) {
      assert.strictEqual(file.value.relativePath, "src/greet.ts");
      assert.strictEqual(file.value.parseState, "ok");
    }

    // Verify the symbol was stored
    const symbols = await storage.getSymbolsInFile("src/greet.ts");
    assert.strictEqual(symbols.ok, true);
    if (symbols.ok) {
      assert.strictEqual(symbols.value.length, 1);
      assert.strictEqual(symbols.value[0]!.name, "greet");
      assert.strictEqual(symbols.value[0]!.kind, "function");
    }
  });

  it("processes a file with imports", async () => {
    const registry = new ParserRegistry();
    registry.register(new TypeScriptParser());
    const storage = new InMemoryStorageAdapter();
    await storage.runMigrations();
    const pipeline = new Pipeline(registry, storage);

    const source = "import { useState } from 'react';\nexport function useCounter() { const [count, setCount] = useState(0); return count; }";
    const result = await pipeline.processFile("src/hooks.ts", source);
    assert.strictEqual(result.ok, true);

    // Verify references were stored
    const refs = await storage.getReferencesInFile("src/hooks.ts");
    assert.strictEqual(refs.ok, true);
    if (refs.ok) {
      const importRefs = refs.value.filter((r) => r.kind === "import");
      assert.ok(importRefs.length >= 1);
    }
  });

  it("quarantines a file with parse errors", async () => {
    const registry = new ParserRegistry();
    registry.register(new TypeScriptParser());
    const storage = new InMemoryStorageAdapter();
    await storage.runMigrations();
    const pipeline = new Pipeline(registry, storage);

    const source = "const x = ;";
    const result = await pipeline.processFile("src/bad.ts", source);
    assert.strictEqual(result.ok, false);

    // File should be quarantined
    const file = await storage.getFile("src/bad.ts");
    assert.strictEqual(file.ok, true);
    if (file.ok && file.value) {
      assert.strictEqual(file.value.parseState, "quarantined");
    }
  });

  it("processes a file with routes", async () => {
    const registry = new ParserRegistry();
    registry.register(new TypeScriptParser());
    const storage = new InMemoryStorageAdapter();
    await storage.runMigrations();
    const pipeline = new Pipeline(registry, storage);

    const source = "app.get('/api/health', healthCheck);";
    const result = await pipeline.processFile("src/routes.ts", source);
    assert.strictEqual(result.ok, true);

    // Verify routes were stored
    const routes = await storage.getRoutes();
    assert.strictEqual(routes.ok, true);
    if (routes.ok) {
      assert.strictEqual(routes.value.length, 1);
      assert.strictEqual(routes.value[0]!.path, "/api/health");
    }
  });

  it("handles file deletion", async () => {
    const registry = new ParserRegistry();
    registry.register(new TypeScriptParser());
    const storage = new InMemoryStorageAdapter();
    await storage.runMigrations();
    const pipeline = new Pipeline(registry, storage);

    // First index a file
    await pipeline.processFile("src/temp.ts", "export const x = 1;");
    const before = await storage.getFile("src/temp.ts");
    assert.strictEqual(before.ok, true);
    if (before.ok) assert.ok(before.value !== null);

    // Then delete it
    const delResult = await pipeline.deleteFile("src/temp.ts");
    assert.strictEqual(delResult.ok, true);

    const after = await storage.getFile("src/temp.ts");
    assert.strictEqual(after.ok, true);
    if (after.ok) assert.strictEqual(after.value, null);
  });

  it("returns error for unsupported file extension", async () => {
    const registry = new ParserRegistry();
    registry.register(new TypeScriptParser());
    const storage = new InMemoryStorageAdapter();
    await storage.runMigrations();
    const pipeline = new Pipeline(registry, storage);

    const result = await pipeline.processFile("src/foo.py", "print('hello')");
    assert.strictEqual(result.ok, false);
  });
});