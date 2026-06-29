/**
 * findUsage — "Where is this symbol used?"
 *
 * Finds all references to a symbol: imports, calls, type references, JSX usage.
 * Returns references grouped by kind, with locations.
 */

import type { ReadStoragePort } from "../../storage/port.ts";
import type { Reference } from "../../domain/reference.ts";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";
import type { BrainError } from "../../domain/errors.ts";
import { brainError } from "../../domain/errors.ts";
import type { QueryMeta } from "../metadata.ts";
import { buildMeta, costFileScan, resolutionConfidence } from "../metadata.ts";
import type { QueryLimits } from "../limits.ts";
import { checkReferenceLimit } from "../limits.ts";
import { sortReferences } from "../ordering.ts";

export interface FindUsageParams {
  readonly symbolId: string;
}

export interface FindUsageResult {
  readonly references: readonly Reference[];
  readonly meta: QueryMeta;
}

export async function findUsage(
  storage: ReadStoragePort,
  params: FindUsageParams,
  limits: QueryLimits,
): Promise<Result<FindUsageResult, BrainError>> {
  // First, get the symbol to know which file it's in
  const symbolResult = await storage.getSymbol(params.symbolId);
  if (!symbolResult.ok) return err(symbolResult.error);
  if (!symbolResult.value) {
    return err(brainError("SymbolNotFound", `Symbol not found: ${params.symbolId}`));
  }

  const symbol = symbolResult.value;

  // Get all references in the same file
  const refsResult = await storage.getReferencesInFile(symbol.relativePath);
  if (!refsResult.ok) return err(refsResult.error);

  // Filter references that reference this symbol
  const matchingRefs = refsResult.value.filter(
    (r) => r.targetSymbolId === params.symbolId || r.specifier === symbol.name,
  );

  // Also check incoming edges for call references
  const edgesResult = await storage.getIncomingEdges(params.symbolId);
  if (!edgesResult.ok) return err(edgesResult.error);

  // For each incoming edge, find the source file's references
  const edgeRefs: Reference[] = [];
  for (const edge of edgesResult.value) {
    const sourceSymbol = await storage.getSymbol(edge.sourceSymbolId);
    if (sourceSymbol.ok && sourceSymbol.value) {
      const fileRefs = await storage.getReferencesInFile(sourceSymbol.value.relativePath);
      if (fileRefs.ok) {
        const calls = fileRefs.value.filter(
          (r) => r.kind === "call" && r.specifier === symbol.name,
        );
        edgeRefs.push(...calls);
      }
    }
  }

  const allRefs = sortReferences([...matchingRefs, ...edgeRefs]);

  // Check limit
  const limitCheck = checkReferenceLimit(allRefs.length, limits);
  if (!limitCheck.ok) return err(limitCheck.error);

  const freshness = await storage.getFreshness();
  if (!freshness.ok) return err(freshness.error);

  // Confidence: how many references have resolved targetSymbolIds
  const resolved = allRefs.filter((r) => r.targetSymbolId !== undefined).length;
  const confidence = resolutionConfidence(resolved, allRefs.length);

  return ok({
    references: allRefs,
    meta: buildMeta("exact", confidence, freshness.value, costFileScan()),
  });
}