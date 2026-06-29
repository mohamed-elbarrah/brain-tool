/**
 * Deterministic ordering helpers.
 *
 * [HARD] §8.7: Every multi-row query needs an ORDER BY.
 * Sort order: relativePath → line → column → symbolId.
 */

import type { Symbol } from "../domain/symbol.ts";
import type { Reference } from "../domain/reference.ts";
import type { Edge } from "../domain/edge.ts";
import type { Component } from "../domain/component.ts";
import type { Route } from "../domain/route.ts";

/** Compare two strings for sorting. */
function cmp(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Compare two numbers for sorting. */
function cmpNum(a: number, b: number): number {
  return a - b;
}

/** Sort symbols by relativePath → name → symbolId. */
export function sortSymbols(symbols: Symbol[]): Symbol[] {
  return [...symbols].sort((a, b) => {
    const p = cmp(a.relativePath, b.relativePath);
    if (p !== 0) return p;
    const n = cmp(a.name, b.name);
    if (n !== 0) return n;
    return cmp(a.symbolId, b.symbolId);
  });
}

/** Sort references by relativePath → startLine → startColumn. */
export function sortReferences(refs: Reference[]): Reference[] {
  return [...refs].sort((a, b) => {
    const p = cmp(a.relativePath, b.relativePath);
    if (p !== 0) return p;
    const l = cmpNum(a.location.startLine, b.location.startLine);
    if (l !== 0) return l;
    return cmpNum(a.location.startColumn, b.location.startColumn);
  });
}

/** Sort edges by sourceSymbolId → kind. */
export function sortEdges(edges: Edge[]): Edge[] {
  return [...edges].sort((a, b) => {
    const s = cmp(a.sourceSymbolId, b.sourceSymbolId);
    if (s !== 0) return s;
    return cmp(a.kind, b.kind);
  });
}

/** Sort components by symbolId. */
export function sortComponents(components: Component[]): Component[] {
  return [...components].sort((a, b) => cmp(a.symbolId, b.symbolId));
}

/** Sort routes by path → method. */
export function sortRoutes(routes: Route[]): Route[] {
  return [...routes].sort((a, b) => {
    const p = cmp(a.path, b.path);
    if (p !== 0) return p;
    return cmp(a.method, b.method);
  });
}