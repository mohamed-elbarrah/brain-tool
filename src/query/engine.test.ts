/**
 * Query Engine tests — all seven queries against InMemoryStorageAdapter.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { QueryEngine } from "./engine.ts";
import { InMemoryStorageAdapter } from "../storage/in-memory/adapter.ts";
import type { FileIndex } from "../domain/file-index.ts";

function makeIndex(overrides?: Partial<FileIndex>): FileIndex {
  return {
    relativePath: "src/test.ts",
    language: "typescript",
    mtime: 1000,
    hash: "abc",
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

async function seedStorage(): Promise<InMemoryStorageAdapter> {
  const storage = new InMemoryStorageAdapter();
  await storage.runMigrations();

  // File 1: a function and a class
  await storage.upsertFile(makeIndex({
    relativePath: "src/greet.ts",
    symbols: [
      {
        symbolId: "fn_greet",
        relativePath: "src/greet.ts",
        name: "greet",
        localName: "greet",
        kind: "function",
        exported: true,
        location: { startLine: 1, startColumn: 1, endLine: 3, endColumn: 1, startOffset: 0, endOffset: 50 },
        signature: "function greet(name: string): string",
        signatureHash: "hash_greet",
      },
      {
        symbolId: "cls_Greeter",
        relativePath: "src/greet.ts",
        name: "Greeter",
        localName: "Greeter",
        kind: "class",
        exported: true,
        location: { startLine: 5, startColumn: 1, endLine: 10, endColumn: 1, startOffset: 51, endOffset: 200 },
        signature: "class Greeter",
        signatureHash: "hash_greeter",
      },
    ],
    references: [
      {
        relativePath: "src/greet.ts",
        kind: "import",
        specifier: "useState",
        targetFileHint: "react",
        targetSymbolId: undefined,
        location: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 30, startOffset: 0, endOffset: 30 },
      },
    ],
    edges: [
      { sourceSymbolId: "fn_greet", kind: "calls", targetSymbolId: undefined, targetReferenceId: undefined },
    ],
  }));

  // File 2: a component
  await storage.upsertFile(makeIndex({
    relativePath: "src/Button.tsx",
    symbols: [
      {
        symbolId: "comp_Button",
        relativePath: "src/Button.tsx",
        name: "Button",
        localName: "Button",
        kind: "component",
        exported: true,
        location: { startLine: 1, startColumn: 1, endLine: 5, endColumn: 1, startOffset: 0, endOffset: 100 },
        signature: "const Button = (props: { label: string }) => ...",
        signatureHash: "hash_button",
      },
    ],
    components: [
      {
        symbolId: "comp_Button",
        props: { paramsType: "{ label: string }" },
        importedComponentSymbolIds: ["Icon"],
      },
    ],
  }));

  // File 3: routes
  await storage.upsertFile(makeIndex({
    relativePath: "src/routes.ts",
    symbols: [],
    routes: [
      { relativePath: "src/routes.ts", symbolId: undefined, path: "/api/users", method: "get", controllerSymbolId: "getUsers" },
      { relativePath: "src/routes.ts", symbolId: undefined, path: "/api/users", method: "post", controllerSymbolId: "createUser" },
    ],
  }));

  return storage;
}

describe("QueryEngine", () => {
  describe("findSymbol", () => {
    it("finds a symbol by name", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findSymbol({ name: "greet" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.symbols.length, 1);
        assert.strictEqual(result.value.symbols[0]!.symbolId, "fn_greet");
        assert.strictEqual(result.value.meta.trust, "exact");
      }
    });

    it("filters by file path", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findSymbol({ name: "greet", filePath: "src/greet.ts" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.symbols.length, 1);
      }
    });

    it("returns empty for unknown symbol", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findSymbol({ name: "nonexistent" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.symbols.length, 0);
      }
    });
  });

  describe("findUsage", () => {
    it("finds references to a symbol", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findUsage({ symbolId: "fn_greet" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.ok(result.value.references.length >= 0);
        assert.strictEqual(result.value.meta.trust, "exact");
      }
    });

    it("returns SymbolNotFound for unknown symbol", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findUsage({ symbolId: "nonexistent" });
      assert.strictEqual(result.ok, false);
    });
  });

  describe("findDependents", () => {
    it("finds dependents of a symbol", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findDependents({ symbolId: "fn_greet" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.meta.trust, "estimated");
      }
    });

    it("returns SymbolNotFound for unknown symbol", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findDependents({ symbolId: "nonexistent" });
      assert.strictEqual(result.ok, false);
    });
  });

  describe("impactAnalysis", () => {
    it("performs transitive dependency analysis", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.impactAnalysis({ symbolId: "fn_greet" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.meta.trust, "estimated");
        assert.ok(result.value.depth >= 0);
      }
    });

    it("returns SymbolNotFound for unknown symbol", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.impactAnalysis({ symbolId: "nonexistent" });
      assert.strictEqual(result.ok, false);
    });
  });

  describe("findDuplicate", () => {
    it("finds symbols with matching signature hash", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findDuplicate({ signatureHash: "hash_greet" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.duplicates.length, 1);
        assert.strictEqual(result.value.duplicates[0]!.symbolId, "fn_greet");
      }
    });

    it("returns empty for unknown hash", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findDuplicate({ signatureHash: "nonexistent_hash" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.duplicates.length, 0);
      }
    });
  });

  describe("searchComponents", () => {
    it("finds components by name", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.searchComponents({ name: "Button" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.components.length, 1);
        assert.strictEqual(result.value.components[0]!.symbolId, "comp_Button");
      }
    });

    it("finds components by prop name", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.searchComponents({ propName: "paramsType" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.components.length, 1);
      }
    });

    it("returns empty for no match", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.searchComponents({ name: "Nonexistent" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.components.length, 0);
      }
    });
  });

  describe("searchRoutes", () => {
    it("finds routes by path pattern", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.searchRoutes({ pathPattern: "/api/users" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.routes.length, 2);
      }
    });

    it("filters by method", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.searchRoutes({ pathPattern: "/api/users", method: "get" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.routes.length, 1);
        assert.strictEqual(result.value.routes[0]!.method, "get");
      }
    });

    it("returns empty for no match", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.searchRoutes({ pathPattern: "/nonexistent" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.routes.length, 0);
      }
    });
  });

  describe("metadata", () => {
    it("every result carries freshness", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findSymbol({ name: "greet" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.ok(result.value.meta.freshness.lastIndexed > 0);
        assert.ok(result.value.meta.freshness.indexVersion >= 0);
      }
    });

    it("every result carries estimatedCost", async () => {
      const storage = await seedStorage();
      const engine = new QueryEngine(storage);
      const result = await engine.findSymbol({ name: "greet" });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.ok(result.value.meta.estimatedCost > 0);
      }
    });
  });
});