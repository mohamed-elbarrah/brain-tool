/**
 * Component extractor — identifies React/JSX component definitions.
 *
 * [HARD] §7.0: TS-aware in MVP. Extractor polymorphism deferred.
 *
 * Looks for:
 *   - Function declarations returning JSX (uppercase-named or typed as React.FC)
 *   - Arrow functions assigned to uppercase const returning JSX
 *   - `export default function` returning JSX
 *   - Class components extending React.Component/PureComponent
 *
 * Props are inferred from the first parameter's type annotation.
 */

import ts from "typescript";
import type { Component } from "../../domain/component.ts";
import type { Symbol } from "../../domain/symbol.ts";

export interface ComponentExtraction {
  readonly components: Component[];
}

/**
 * Scan a list of already-extracted symbols plus the AST for component metadata.
 * Each component found must have a matching symbol in `symbols`.
 *
 * @param sourceFile — the parsed AST
 * @param symbols — symbols already extracted from this file (used to match)
 * @returns extracted Component records
 */
export function extractComponents(
  sourceFile: ts.SourceFile,
  symbols: readonly Symbol[],
): ComponentExtraction {
  const components: Component[] = [];

  function visit(node: ts.Node): void {
    // Function/arrow components: look for export default function, or
    // const Foo = () => ...
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      const sym = symbols.find((s) => s.name === name);
      if (sym && (sym.kind === "component" || sym.kind === "function")) {
        const props = extractPropsFromVarDecl(node, sourceFile);
        const importedComponents = extractImportedComponents(node);
        components.push({
          symbolId: sym.symbolId,
          props,
          importedComponentSymbolIds: importedComponents,
        });
      }
    }

    // Function declarations returning JSX
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const sym = symbols.find((s) => s.name === name);
      if (sym && (sym.kind === "component" || sym.kind === "function")) {
        const props = extractPropsFromFnDecl(node, sourceFile);
        const importedComponents = extractImportedComponents(node);
        components.push({
          symbolId: sym.symbolId,
          props,
          importedComponentSymbolIds: importedComponents,
        });
      }
    }

    // Class components extending React.Component
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const sym = symbols.find((s) => s.name === name);
      if (sym && (sym.kind === "component" || sym.kind === "function")) {
        const props: Record<string, unknown> = {};
        // Try to get props from type parameters or first constructor param
        const propsType = extractClassProps(node, sourceFile);
        if (propsType) props.type = propsType;
        const importedComponents = extractImportedComponents(node);
        components.push({
          symbolId: sym.symbolId,
          props,
          importedComponentSymbolIds: importedComponents,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { components };
}

// ---- Helpers ----

function extractPropsFromVarDecl(
  node: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (node.initializer && ts.isArrowFunction(node.initializer)) {
    const arrow = node.initializer;
    if (arrow.parameters.length > 0) {
      const firstParam = arrow.parameters[0];
      if (firstParam && firstParam.type) {
        result.paramsType = firstParam.type.getText(sourceFile);
      }
    }
  }
  return result;
}

function extractPropsFromFnDecl(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (node.parameters.length > 0) {
    const firstParam = node.parameters[0];
    if (firstParam && firstParam.type) {
      result.paramsType = firstParam.type.getText(sourceFile);
    }
  }
  return result;
}

function extractClassProps(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): string | undefined {
  // Check heritage clauses for React.Component<Props>
  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const type of clause.types) {
          if (type.typeArguments && type.typeArguments.length > 0) {
            return type.typeArguments[0]!.getText(sourceFile);
          }
        }
      }
    }
  }
  return undefined;
}

function extractImportedComponents(
  node: ts.Node,
): string[] {
  // Naive heuristic: find identifiers that look like JSX elements inside the body
  const imports: string[] = [];
  function walk(n: ts.Node): void {
    if (ts.isJsxOpeningElement(n)) {
      const tagName = n.tagName;
      if (ts.isIdentifier(tagName)) {
        const name = tagName.text;
        if (name[0] === name[0]?.toUpperCase() && name !== "React") {
          imports.push(name);
        }
      }
    }
    ts.forEachChild(n, walk);
  }
  walk(node);
  return [...new Set(imports)];
}