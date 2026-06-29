/**
 * Tests for FileIndex — round-trip JSON serialization.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FileIndex } from "./file-index.ts";
import { makeLocation } from "./location.ts";

void describe("FileIndex", () => {
  const sample: FileIndex = {
    relativePath: "src/foo.ts",
    language: "typescript",
    mtime: 1_234_567_890,
    hash: "abc123",
    parseState: "ok",
    error: undefined,
    symbols: [
      {
        symbolId: "abc123def4567890",
        relativePath: "src/foo.ts",
        name: "myFunc",
        localName: "myFunc",
        kind: "function",
        exported: true,
        location: makeLocation(1, 1, 5, 1),
        signature: "(x: number): string",
        signatureHash: "fedcba0987654321",
      },
    ],
    members: [],
    references: [
      {
        relativePath: "src/foo.ts",
        kind: "import",
        specifier: "./other",
        targetFileHint: undefined,
        targetSymbolId: undefined,
        location: makeLocation(1, 1, 1, 20),
      },
    ],
    edges: [],
    components: [],
    routes: [],
  };

  void it("serializes to JSON and back without data loss", () => {
    const json = JSON.stringify(sample);
    const parsed = JSON.parse(json) as FileIndex;
    assert.equal(parsed.relativePath, sample.relativePath);
    assert.equal(parsed.language, sample.language);
    assert.equal(parsed.mtime, sample.mtime);
    assert.equal(parsed.symbols.length, 1);
    assert.equal(parsed.symbols[0]!.name, "myFunc");
    assert.equal(parsed.symbols[0]!.location.startLine, 1);
    assert.equal(parsed.symbols[0]!.signatureHash, "fedcba0987654321");
    assert.equal(parsed.members.length, 0);
    assert.equal(parsed.references.length, 1);
    assert.equal(parsed.edges.length, 0);
    assert.equal(parsed.components.length, 0);
    assert.equal(parsed.routes.length, 0);
  });

  void it("handles empty arrays", () => {
    const empty: FileIndex = {
      relativePath: "src/empty.ts",
      language: "typescript",
      mtime: 0,
      hash: "",
      parseState: "ok",
      error: undefined,
      symbols: [],
      members: [],
      references: [],
      edges: [],
      components: [],
      routes: [],
    };
    const json = JSON.stringify(empty);
    const parsed = JSON.parse(json) as FileIndex;
    assert.equal(parsed.symbols.length, 0);
    assert.equal(parsed.references.length, 0);
  });

  void it("handles error parse state with message", () => {
    const errorIndex: FileIndex = {
      relativePath: "src/broken.ts",
      language: "typescript",
      mtime: 0,
      hash: "",
      parseState: "error",
      error: "Syntax error at line 10",
      symbols: [],
      members: [],
      references: [],
      edges: [],
      components: [],
      routes: [],
    };
    const json = JSON.stringify(errorIndex);
    const parsed = JSON.parse(json) as FileIndex;
    assert.equal(parsed.parseState, "error");
    assert.equal(parsed.error, "Syntax error at line 10");
  });
});