/**
 * Tests for the component extractor.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import { extractComponents } from "./components.ts";
import { extractSymbols } from "./symbols.ts";

function parse(source: string, filePath = "src/App.tsx"): ts.SourceFile {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

describe("extractComponents", () => {
  it("extracts a component from a const arrow function", () => {
    const source = "const Button = (props: { label: string }) => <button>{props.label}</button>;";
    const ast = parse(source);
    const { symbols } = extractSymbols(ast, "src/Button.tsx");
    const { components } = extractComponents(ast, symbols);
    assert.strictEqual(components.length, 1);
    assert.strictEqual(components[0]!.props.paramsType, "{ label: string }");
  });

  it("extracts a component from a function declaration", () => {
    const source = "function Header() { return <h1>Title</h1>; }";
    const ast = parse(source);
    const { symbols } = extractSymbols(ast, "src/Header.tsx");
    const { components } = extractComponents(ast, symbols);
    assert.strictEqual(components.length, 1);
  });

  it("returns empty for non-component symbols", () => {
    const source = "const x = 42;";
    const ast = parse(source);
    const { symbols } = extractSymbols(ast, "src/test.ts");
    const { components } = extractComponents(ast, symbols);
    assert.strictEqual(components.length, 0);
  });

  it("detects JSX element usage as imported components", () => {
    const source = "const App = () => <div><Button>Click</Button></div>;";
    const ast = parse(source);
    const { symbols } = extractSymbols(ast, "src/App.tsx");
    const { components } = extractComponents(ast, symbols);
    assert.strictEqual(components.length, 1);
    // Button should be detected as an imported component
    assert.ok(components[0]!.importedComponentSymbolIds.includes("Button"));
  });
});