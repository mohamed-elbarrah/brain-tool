/**
 * Symbol extractor — walks a TS AST to extract symbols, references, and edges.
 *
 * [HARD] §7.2: Extraction is pure — no DB access. Produces domain entities.
 * [HARD] §7.0: TS-aware in MVP. Extractor polymorphism is deferred.
 *
 * Extracts:
 *   - Function declarations, arrow functions assigned to const/let
 *   - Class declarations, interface declarations, type alias, enum
 *   - Variable declarations (const/let/var) with heuristics for components
 *   - Import/export declarations → Reference[]
 *   - Call expressions → edge + reference pairs
 */

import ts from "typescript";
import type { Symbol } from "../../domain/symbol.ts";
import type { Reference } from "../../domain/reference.ts";
import type { Edge } from "../../domain/edge.ts";
import type { SymbolKind, MemberKind } from "../../domain/identity.ts";
import { symbolId, signatureHash } from "../../domain/identity.ts";
import { makeLocation } from "../../domain/location.ts";

export interface ExtractionResult {
  readonly symbols: Symbol[];
  readonly members: Array<{ symbolId: string; kind: MemberKind; name: string; type: string; order: number }>;
  readonly references: Reference[];
  readonly edges: Edge[];
}

/**
 * Extract symbols, references, and edges from a parsed TS source file.
 * `filePath` must be the stable relative path.
 */
export function extractSymbols(
  sourceFile: ts.SourceFile,
  filePath: string,
): ExtractionResult {
  const symbols: Symbol[] = [];
  const members: Array<{ symbolId: string; kind: MemberKind; name: string; type: string; order: number }> = [];
  const references: Reference[] = [];
  const edges: Edge[] = [];

  function visit(node: ts.Node): void {
    // ---- Import declarations ----
    if (ts.isImportDeclaration(node)) {
      const specifier = extractSpecifier(node);
      const modPath = extractModulePath(node);
      if (modPath && specifier) {
        references.push({
          relativePath: filePath,
          kind: "import",
          specifier,
          targetFileHint: modPath,
          targetSymbolId: undefined,
          location: loc(node),
        });
      }
      // Walk children for named-import elements
      ts.forEachChild(node, visit);
      return;
    }

    // ---- Export declarations ----
    if (ts.isExportDeclaration(node)) {
      const modPath = extractModulePath(node);
      if (modPath) {
        references.push({
          relativePath: filePath,
          kind: "reexport",
          specifier: modPath,
          targetFileHint: modPath,
          targetSymbolId: undefined,
          location: loc(node),
        });
      }
      ts.forEachChild(node, visit);
      return;
    }

    // ---- Export assignments (export = ...) ----
    if (ts.isExportAssignment(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    // ---- Function declarations ----
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const kind: SymbolKind = "function";
      const exported = isExported(node);
      const sig = getSignature(node, sourceFile);
      const id = symbolId(filePath, name, kind);
      addSymbol(symbols, id, filePath, name, kind, exported, loc(node), sig);
      collectCallees(node, filePath, id, edges, references);
      ts.forEachChild(node, visit);
      return;
    }

    // ---- Variable declarations ----
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      const p = node.parent;
      const exported = p && ts.isVariableDeclarationList(p) ? isExported(p.parent) : false;
      const kind = inferKind(node, name);
      const sig = getSignature(node, sourceFile);
      const id = symbolId(filePath, name, kind);
      addSymbol(symbols, id, filePath, name, kind, exported, loc(node), sig);
      collectCallees(node, filePath, id, edges, references);
      ts.forEachChild(node, visit);
      return;
    }

    // ---- Class declarations ----
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const kind: SymbolKind = "class";
      const exported = isExported(node);
      const sig = getSignature(node, sourceFile);
      const id = symbolId(filePath, name, kind);
      addSymbol(symbols, id, filePath, name, kind, exported, loc(node), sig);

      let memberOrder = 0;
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          members.push({ symbolId: id, kind: "method" as MemberKind, name: memberNameText(member.name), type: "", order: memberOrder++ });
        } else if (ts.isPropertyDeclaration(member) && member.name) {
          const mName = memberNameText(member.name);
          const mType = member.type ? member.type.getText(sourceFile) : "";
          members.push({ symbolId: id, kind: "property" as MemberKind, name: mName, type: mType, order: memberOrder++ });
        }
      }
      collectCallees(node, filePath, id, edges, references);
      ts.forEachChild(node, visit);
      return;
    }

    // ---- Interface declarations ----
    if (ts.isInterfaceDeclaration(node) && node.name) {
      const name = node.name.text;
      const kind: SymbolKind = "interface";
      const exported = isExported(node);
      const sig = getSignature(node, sourceFile);
      const id = symbolId(filePath, name, kind);
      addSymbol(symbols, id, filePath, name, kind, exported, loc(node), sig);

      let memberOrder = 0;
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const mName = memberNameText(member.name);
          const mType = member.type ? member.type.getText(sourceFile) : "";
          members.push({ symbolId: id, kind: "property" as MemberKind, name: mName, type: mType, order: memberOrder++ });
        } else if (ts.isMethodSignature(member) && member.name) {
          members.push({ symbolId: id, kind: "method" as MemberKind, name: memberNameText(member.name), type: "", order: memberOrder++ });
        }
      }
      ts.forEachChild(node, visit);
      return;
    }

    // ---- Type alias ----
    if (ts.isTypeAliasDeclaration(node) && node.name) {
      const kind: SymbolKind = "type";
      addSymbol(symbols, idFrom(filePath, node.name.text, kind), filePath, node.name.text, kind, isExported(node), loc(node), getSignature(node, sourceFile));
      ts.forEachChild(node, visit);
      return;
    }

    // ---- Enum ----
    if (ts.isEnumDeclaration(node) && node.name) {
      const kind: SymbolKind = "enum";
      addSymbol(symbols, idFrom(filePath, node.name.text, kind), filePath, node.name.text, kind, isExported(node), loc(node), getSignature(node, sourceFile));
      ts.forEachChild(node, visit);
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { symbols, members, references, edges };
}

// ---- Helpers ----

function loc(node: ts.Node): { startLine: number; startColumn: number; endLine: number | undefined; endColumn: number | undefined; startOffset: number | undefined; endOffset: number | undefined } {
  const sf = node.getSourceFile();
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const end = sf.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
    startOffset: node.getStart(sf),
    endOffset: node.getEnd(),
  };
}

function idFrom(relPath: string, name: string, kind: SymbolKind): string {
  return symbolId(relPath, name, kind);
}

function addSymbol(
  arr: Symbol[],
  symId: string,
  relPath: string,
  name: string,
  kind: SymbolKind,
  exported: boolean,
  location: { startLine: number; startColumn: number; endLine: number | undefined; endColumn: number | undefined; startOffset: number | undefined; endOffset: number | undefined },
  sig: string,
): void {
  arr.push({
    symbolId: symId,
    relativePath: relPath,
    name,
    localName: name,
    kind,
    exported,
    location: makeLocation(location.startLine, location.startColumn, location.endLine, location.endColumn, location.startOffset, location.endOffset),
    signature: sig,
    signatureHash: signatureHash(sig),
  });
}

function isExported(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node);
    if (modifiers) {
      for (const mod of modifiers) {
        if (mod.kind === ts.SyntaxKind.ExportKeyword || mod.kind === ts.SyntaxKind.DefaultKeyword) return true;
      }
    }
  }
  return false;
}

function getSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return node.getText(sourceFile);
  }
  return node.getText(sourceFile).split("\n")[0] ?? "";
}

function inferKind(node: ts.VariableDeclaration, name: string): SymbolKind {
  const firstChar = name.charAt(0);
  if (node.initializer) {
    if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) return "function";
    if (ts.isClassExpression(node.initializer)) return "class";
    if (firstChar === firstChar.toUpperCase() && firstChar !== "") return "component";
  }
  if (firstChar === firstChar.toUpperCase() && firstChar !== "") return "component";
  return "var";
}

function extractSpecifier(node: ts.ImportDeclaration): string | undefined {
  const clause = node.importClause;
  if (!clause) return undefined;
  const parts: string[] = [];
  if (clause.name) parts.push(clause.name.text);
  if (clause.namedBindings) {
    if (ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) parts.push(el.name.text);
    } else if (ts.isNamespaceImport(clause.namedBindings)) {
      parts.push(clause.namedBindings.name.text);
    }
  }
  return parts.join(",") || undefined;
}

function extractModulePath(node: ts.ImportDeclaration | ts.ExportDeclaration): string | undefined {
  if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) return node.moduleSpecifier.text;
  return undefined;
}

function collectCallees(
  node: ts.Node,
  filePath: string,
  sourceId: string,
  edges: Edge[],
  references: Reference[],
): void {
  function walk(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      let calleeName: string | undefined;
      if (ts.isIdentifier(callee)) {
        calleeName = callee.text;
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
        calleeName = callee.name.text;
      }
      if (calleeName) {
        const edgeLoc = loc(n);
        references.push({
          relativePath: filePath,
          kind: "call",
          specifier: calleeName,
          targetFileHint: undefined,
          targetSymbolId: undefined,
          location: makeLocation(edgeLoc.startLine, edgeLoc.startColumn, edgeLoc.endLine, edgeLoc.endColumn, edgeLoc.startOffset, edgeLoc.endOffset),
        });
        edges.push({
          sourceSymbolId: sourceId,
          kind: "calls",
          targetSymbolId: undefined,
          targetReferenceId: undefined,
        });
      }
    }
    ts.forEachChild(n, walk);
  }
  walk(node);
}

function memberNameText(name: ts.PropertyName | ts.BindingName): string {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return "unknown";
}