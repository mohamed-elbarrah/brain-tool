/**
 * Tests for Result.
 *
 * [HARD] §8.2: Result-based errors; throw only for bugs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { err, isResult, ok, type Result } from "./result.ts";
import type { BrainError } from "./errors.ts";

void describe("ok", () => {
  void it("creates a success result with a value", () => {
    const r = ok(42);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value, 42);
    }
  });

  void it("type-narrows correctly", () => {
    const r: Result<number, BrainError> = ok(1);
    if (r.ok) {
      // r.value is number
      assert.equal(r.value, 1);
    }
  });
});

void describe("err", () => {
  void it("creates a failure result with an error", () => {
    const error: BrainError = { code: "SymbolNotFound", message: "Not found" };
    const r = err(error);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.code, "SymbolNotFound");
      assert.equal(r.error.message, "Not found");
    }
  });

  void it("type-narrows correctly", () => {
    const error: BrainError = { code: "BadInput", message: "bad" };
    const r: Result<number, BrainError> = err(error);
    if (!r.ok) {
      // r.error is BrainError
      assert.equal(r.error.code, "BadInput");
    }
  });
});

void describe("isResult", () => {
  void it("returns true for ok result", () => {
    assert.equal(isResult(ok("hi")), true);
  });

  void it("returns true for err result", () => {
    assert.equal(isResult(err({ code: "Internal", message: "fail" })), true);
  });

  void it("returns false for plain objects", () => {
    assert.equal(isResult({ value: 1 }), false);
  });

  void it("returns false for null", () => {
    assert.equal(isResult(null), false);
  });

  void it("returns false for primitive values", () => {
    assert.equal(isResult(42), false);
    assert.equal(isResult("hello"), false);
  });
});