/**
 * Tests for the symbol extractor.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import { extractSymbols } from "./symbols.ts";

function parse(source: string, filePath = "src/test.ts"): ts.SourceFile {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

describe("extractSymbols", () => {
  it("extracts a function declaration", () => {
    const source = "export function greet(name: string): string { return `Hi ${name}`; }";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 1);
    const sym = result.symbols[0]!;
    assert.strictEqual(sym.name, "greet");
    assert.strictEqual(sym.kind, "function");
    assert.strictEqual(sym.exported, true);
    assert.strictEqual(sym.relativePath, "src/test.ts");
    assert.ok(sym.symbolId);
    assert.ok(sym.signatureHash);
  });

  it("extracts a class declaration", () => {
    const source = "export class MyService { doStuff(): void {} }";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 1);
    const sym = result.symbols[0]!;
    assert.strictEqual(sym.name, "MyService");
    assert.strictEqual(sym.kind, "class");
    assert.strictEqual(sym.exported, true);
  });

  it("extracts class members", () => {
    const source = "class Foo { bar(): void {} baz = 42; }";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.members.length, 2);
    assert.strictEqual(result.members[0]!.kind, "method");
    assert.strictEqual(result.members[0]!.name, "bar");
    assert.strictEqual(result.members[1]!.kind, "property");
    assert.strictEqual(result.members[1]!.name, "baz");
  });

  it("extracts an interface", () => {
    const source = "export interface User { name: string; age: number; }";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 1);
    assert.strictEqual(result.symbols[0]!.name, "User");
    assert.strictEqual(result.symbols[0]!.kind, "interface");
  });

  it("extracts interface members", () => {
    const source = "interface Foo { bar(): void; baz: number; }";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.members.length, 2);
    assert.strictEqual(result.members[0]!.kind, "method");
    assert.strictEqual(result.members[0]!.name, "bar");
    assert.strictEqual(result.members[1]!.kind, "property");
    assert.strictEqual(result.members[1]!.name, "baz");
  });

  it("extracts a type alias", () => {
    const source = "export type MyType = string | number;";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 1);
    assert.strictEqual(result.symbols[0]!.name, "MyType");
    assert.strictEqual(result.symbols[0]!.kind, "type");
  });

  it("extracts an enum", () => {
    const source = "export enum Color { Red, Green, Blue }";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 1);
    assert.strictEqual(result.symbols[0]!.name, "Color");
    assert.strictEqual(result.symbols[0]!.kind, "enum");
  });

  it("extracts a const arrow function as function kind", () => {
    const source = "const greet = (name: string) => `Hi ${name}`;";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 1);
    assert.strictEqual(result.symbols[0]!.name, "greet");
    assert.strictEqual(result.symbols[0]!.kind, "function");
  });

  it("extracts import references", () => {
    const source = "import { useState } from 'react';";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.references.length, 1);
    assert.strictEqual(result.references[0]!.kind, "import");
    assert.strictEqual(result.references[0]!.specifier, "useState");
    assert.strictEqual(result.references[0]!.targetFileHint, "react");
  });

  it("extracts re-export references", () => {
    const source = "export { foo } from './bar';";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.references.length, 1);
    assert.strictEqual(result.references[0]!.kind, "reexport");
    assert.strictEqual(result.references[0]!.targetFileHint, "./bar");
  });

  it("extracts call edges", () => {
    const source = "function caller() { callee(); }";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 1);
    assert.strictEqual(result.symbols[0]!.name, "caller");
    // Should have a call reference and an edge
    const callRefs = result.references.filter((r: { kind: string }) => r.kind === "call");
    assert.ok(callRefs.length >= 1);
    assert.strictEqual(callRefs[0]!.specifier, "callee");
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0]!.kind, "calls");
  });

  it("extracts multiple symbols from one file", () => {
    const source = `
      export function foo() {}
      export function bar() {}
      const baz = 42;
    `;
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 3);
  });

  it("handles empty file", () => {
    const source = "";
    const ast = parse(source);
    const result = extractSymbols(ast, "src/test.ts");
    assert.strictEqual(result.symbols.length, 0);
    assert.strictEqual(result.references.length, 0);
    assert.strictEqual(result.edges.length, 0);
  });
});