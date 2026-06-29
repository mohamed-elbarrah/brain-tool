/**
 * IPC transport tests — server + client round-trip.
 *
 * Starts a real Unix socket server with an in-memory storage adapter,
 * connects a client, and tests all 7 queries + capabilities + error cases.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { IpcServer } from "./server.ts";
import { IpcClient } from "./client.ts";
import { QueryEngine } from "../../query/engine.ts";
import { InMemoryStorageAdapter } from "../../storage/in-memory/adapter.ts";
import type { FileIndex } from "../../domain/file-index.ts";

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

async function createTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-ipc-test-"));
  const token = "test-token-123";

  const storage = new InMemoryStorageAdapter();
  await storage.runMigrations();

  // Seed some data
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
    ],
  }));

  const engine = new QueryEngine(storage);
  const server = new IpcServer(engine, { brainDir: tmpDir, token });
  const socketPath = await server.start();

  const client = new IpcClient();
  await client.connect(socketPath, token);

  return { server, client, storage, tmpDir };
}

describe("IPC transport", () => {
  it("capabilities returns tool list and versions", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      const caps = await client.capabilities();
      assert.ok(caps.tools.includes("findSymbol"));
      assert.ok(caps.tools.includes("findUsage"));
      assert.strictEqual(caps.versions.ipcProtocol, 1);
      assert.strictEqual(caps.features.semanticSearch, false);
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("findSymbol returns matching symbols", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      const result = await client.findSymbol({ name: "greet" }) as any;
      assert.ok(result.symbols);
      assert.strictEqual(result.symbols.length, 1);
      assert.strictEqual(result.symbols[0].name, "greet");
      assert.ok(result.meta);
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("findSymbol returns empty for unknown symbol", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      const result = await client.findSymbol({ name: "nonexistent" }) as any;
      assert.strictEqual(result.symbols.length, 0);
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("findUsage returns SymbolNotFound for unknown symbol", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      await assert.rejects(
        () => client.findUsage({ symbolId: "nonexistent" }),
        /Symbol not found/,
      );
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("findDependents returns dependents", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      const result = await client.findDependents({ symbolId: "fn_greet" }) as any;
      assert.ok(result.meta);
      assert.strictEqual(result.meta.trust, "estimated");
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("impactAnalysis returns affected symbols", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      const result = await client.impactAnalysis({ symbolId: "fn_greet" }) as any;
      assert.ok(result.meta);
      assert.ok(result.depth >= 0);
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("findDuplicate returns matching symbols", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      const result = await client.findDuplicate({ signatureHash: "hash_greet" }) as any;
      assert.strictEqual(result.duplicates.length, 1);
      assert.strictEqual(result.duplicates[0].symbolId, "fn_greet");
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("searchComponents returns empty when no components indexed", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      const result = await client.searchComponents({ name: "Button" }) as any;
      assert.strictEqual(result.components.length, 0);
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("searchRoutes returns empty when no routes indexed", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      const result = await client.searchRoutes({ pathPattern: "/api" }) as any;
      assert.strictEqual(result.routes.length, 0);
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("unknown method returns error", async () => {
    const { server, client, tmpDir } = await createTestEnv();
    try {
      // Access the internal sendRequest to test unknown methods
      await assert.rejects(
        () => (client as any).sendRequest("unknownMethod"),
        /Unknown method/,
      );
    } finally {
      await client.disconnect();
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("client rejects when daemon is not running", async () => {
    const client = new IpcClient();
    await assert.rejects(
      () => client.connect("/tmp/nonexistent.sock", "token"),
    );
  });
});