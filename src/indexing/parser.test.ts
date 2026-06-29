/**
 * Tests for the TypeScript parser and ParserRegistry.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { TypeScriptParser } from "./parsers/typescript.ts";
import { ParserRegistry } from "./parser-registry.ts";

describe("TypeScriptParser", () => {
  it("parses a simple function declaration", () => {
    const parser = new TypeScriptParser();
    const source = "export function hello(name: string): string { return `Hello ${name}`; }";
    const result = parser.parse(source, "src/hello.ts");
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.language, "typescript");
      assert.strictEqual(result.value.filePath, "src/hello.ts");
      assert.strictEqual(result.value.source, source);
      assert.ok(result.value.ast);
    }
  });

  it("parses .tsx files with JSX", () => {
    const parser = new TypeScriptParser();
    const source = "const App = () => <div>Hello</div>;";
    const result = parser.parse(source, "src/App.tsx");
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.language, "typescript");
    }
  });

  it("returns error for invalid syntax", () => {
    const parser = new TypeScriptParser();
    const source = "const x = ;";
    const result = parser.parse(source, "src/bad.ts");
    assert.strictEqual(result.ok, false);
  });

  it("reports correct extensions", () => {
    const parser = new TypeScriptParser();
    assert.deepStrictEqual(parser.extensions, [".ts", ".tsx"]);
  });
});

describe("ParserRegistry", () => {
  it("registers and retrieves a parser by language", () => {
    const registry = new ParserRegistry();
    const parser = new TypeScriptParser();
    registry.register(parser);
    assert.strictEqual(registry.get("typescript"), parser);
  });

  it("resolves parser by file extension", () => {
    const registry = new ParserRegistry();
    const parser = new TypeScriptParser();
    registry.register(parser);
    assert.strictEqual(registry.resolve("src/foo.ts"), parser);
    assert.strictEqual(registry.resolve("src/bar.tsx"), parser);
  });

  it("returns undefined for unknown extension", () => {
    const registry = new ParserRegistry();
    const parser = new TypeScriptParser();
    registry.register(parser);
    assert.strictEqual(registry.resolve("src/foo.py"), undefined);
  });

  it("has() returns correct boolean", () => {
    const registry = new ParserRegistry();
    const parser = new TypeScriptParser();
    registry.register(parser);
    assert.strictEqual(registry.has("typescript"), true);
    assert.strictEqual(registry.has("javascript"), false);
    assert.strictEqual(registry.resolve("src/foo.py"), undefined);
  });

  it("all() returns all registered parsers", () => {
    const registry = new ParserRegistry();
    const parser = new TypeScriptParser();
    registry.register(parser);
    assert.strictEqual(registry.all().length, 1);
    assert.strictEqual(registry.all()[0], parser);
  });
});