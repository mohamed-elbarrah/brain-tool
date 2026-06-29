/**
 * Tests for identity helpers.
 *
 * [HARD] §6.2: symbolId and signatureHash must be deterministic and stable.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fnv1a64,
  normalizeRelativePath,
  signatureHash,
  symbolId,
} from "./identity.ts";

void describe("fnv1a64", () => {
  void it("produces a deterministic 16-char hex string", () => {
    const result = fnv1a64("hello");
    assert.equal(typeof result, "string");
    assert.equal(result.length, 16);
    assert.match(result, /^[0-9a-f]+$/);
  });

  void it("same input → same output", () => {
    const a = fnv1a64("src/domain/symbol.ts:MyClass:class");
    const b = fnv1a64("src/domain/symbol.ts:MyClass:class");
    assert.equal(a, b);
  });

  void it("different inputs → different outputs", () => {
    const a = fnv1a64("foo");
    const b = fnv1a64("bar");
    assert.notEqual(a, b);
  });

  void it("empty string produces a valid hash", () => {
    const result = fnv1a64("");
    assert.equal(result.length, 16);
  });
});

void describe("symbolId", () => {
  void it("produces a deterministic stable id", () => {
    const id = symbolId("src/foo.ts", "myFunc", "function");
    assert.equal(typeof id, "string");
    assert.equal(id.length, 16);
  });

  void it("same inputs → same id", () => {
    const a = symbolId("src/bar.ts", "Bar", "class");
    const b = symbolId("src/bar.ts", "Bar", "class");
    assert.equal(a, b);
  });

  void it("different kind → different id", () => {
    const a = symbolId("src/x.ts", "X", "function");
    const b = symbolId("src/x.ts", "X", "class");
    assert.notEqual(a, b);
  });
});

void describe("signatureHash", () => {
  void it("produces a deterministic hash", () => {
    const h = signatureHash("(x: number): string");
    assert.equal(typeof h, "string");
    assert.equal(h.length, 16);
  });

  void it("same signature → same hash", () => {
    const a = signatureHash("(a: string, b: number): void");
    const b = signatureHash("(a: string, b: number): void");
    assert.equal(a, b);
  });
});

void describe("normalizeRelativePath", () => {
  void it("converts backslashes to forward slashes", () => {
    assert.equal(normalizeRelativePath("src\\foo\\bar.ts"), "src/foo/bar.ts");
  });

  void it("strips leading ./", () => {
    assert.equal(normalizeRelativePath("./src/foo.ts"), "src/foo.ts");
  });

  void it("removes trailing slash", () => {
    assert.equal(normalizeRelativePath("src/foo/"), "src/foo");
  });

  void it("collapses double slashes", () => {
    assert.equal(normalizeRelativePath("src//foo.ts"), "src/foo.ts");
  });

  void it("handles already-normalized paths", () => {
    assert.equal(normalizeRelativePath("src/foo.ts"), "src/foo.ts");
  });
});
