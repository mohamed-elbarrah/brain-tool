/**
 * Reconciler — resolves raw references to symbolIds.
 *
 * [HARD] §6.1 / §7.2: Lazy identity — store raw references, resolve to
 * symbols in a reconciliation pass. Unresolved references are retained,
 * not dropped. Reconciliation is idempotent: running it twice yields the
 * same DB state.
 *
 * The reconciler reads existing symbols from the StoragePort (to know
 * what's already indexed), then matches each reference's specifier to a
 * symbolId. For imports, it tries to resolve the module path + export name
 * against known files. For calls, it looks up the local name.
 *
 * In MVP, this is a best-effort resolution. Cross-reference resolution
 * across files requires knowing which symbols each file exports. The full
 * resolver would trace module graphs; MVP does a simple name-based lookup.
 */

import type { ReadStoragePort } from "../storage/port.ts";
import type { Reference } from "../domain/reference.ts";
import type { Edge } from "../domain/edge.ts";
import type { Result } from "../domain/result.ts";
import type { BrainError } from "../domain/errors.ts";

export interface ReconciliationInput {
  readonly references: readonly Reference[];
  readonly edges: readonly Edge[];
  readonly filePath: string;
}

export interface ReconciliationOutput {
  readonly references: Reference[];
  readonly edges: Edge[];
}

/**
 * Reconcile references and edges against the current index.
 *
 * For each reference with kind "import" or "call", try to resolve
 * `specifier` to a symbolId. Matches the specifier name against known
 * symbol names across all indexed files. On match, updates
 * `targetSymbolId` on the reference and any corresponding edge.
 *
 * Unresolved references keep `targetSymbolId = undefined`.
 *
 * @param input — references and edges from extraction
 * @param storage — read-only access to existing symbols
 * @returns reconciled references and edges with filled targetSymbolIds
 */
export async function reconcile(
  input: ReconciliationInput,
  storage: ReadStoragePort,
): Promise<Result<ReconciliationOutput, BrainError>> {
  const resolvedRefs: Reference[] = [];
  const resolvedEdges: Edge[] = [];

  // Build a local name→symbolId map from the current file's own symbols
  // (faster than querying storage for every single reference)
  const localSymbols = await storage.getSymbolsInFile(input.filePath);
  let localMap = new Map<string, string>();
  if (localSymbols.ok) {
    for (const sym of localSymbols.value) {
      localMap.set(sym.name, sym.symbolId);
      localMap.set(sym.localName, sym.symbolId);
    }
  }

  // Also pre-fetch all known symbols for global name resolution
  const allSymbolsResult = await storage.querySymbols({});
  let globalNameMap = new Map<string, string[]>();
  if (allSymbolsResult.ok) {
    for (const sym of allSymbolsResult.value) {
      const existing = globalNameMap.get(sym.name) ?? [];
      existing.push(sym.symbolId);
      globalNameMap.set(sym.name, existing);
    }
  }

  // Track edge index so we can pair call-refs with call-edges
  let edgeIdx = 0;

  for (const ref of input.references) {
    let resolved: string | undefined;

    // Try local first
    resolved = localMap.get(ref.specifier);
    if (!resolved) {
      // Try global name match
      const candidates = globalNameMap.get(ref.specifier);
      if (candidates && candidates.length > 0) {
        // Pick the first candidate (best-effort; full resolver later)
        resolved = candidates[0];
      }
    }

    resolvedRefs.push({
      ...ref,
      targetSymbolId: resolved ?? ref.targetSymbolId,
    });

    // If this is a "call" reference, there's a corresponding edge at edgeIdx
    if (ref.kind === "call" && edgeIdx < input.edges.length) {
      const edge = input.edges[edgeIdx]!;
      resolvedEdges.push({
        ...edge,
        targetSymbolId: resolved ?? edge.targetSymbolId,
      });
      edgeIdx++;
    } else {
      // Non-call edges pass through unchanged
      if (edgeIdx < input.edges.length) {
        // In MVP, we simply pass all non-call edges through.
        // A full reconciler would match by line number.
        // A full reconciler would match by line number.
      }
    }
  }

  // Add any remaining edges that weren't paired with references
  while (edgeIdx < input.edges.length) {
    resolvedEdges.push(input.edges[edgeIdx]!);
    edgeIdx++;
  }

  return { ok: true, value: { references: resolvedRefs, edges: resolvedEdges } } as any;
}