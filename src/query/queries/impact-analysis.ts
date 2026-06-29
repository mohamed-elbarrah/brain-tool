/**
 * impactAnalysis — "What breaks if this symbol changes?"
 *
 * Performs a transitive closure of dependents: finds all symbols that
 * directly or indirectly depend on the given symbol. This is the most
 * expensive query — it walks the graph outward level by level.
 *
 * [HARD] §8.6: Respects maxTraversalDepth. Returns LimitExceeded if
 * the traversal would go deeper than allowed.
 */

import type { ReadStoragePort } from "../../storage/port.ts";
import type { Symbol } from "../../domain/symbol.ts";
import type { Edge } from "../../domain/edge.ts";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";
import type { BrainError } from "../../domain/errors.ts";
import { brainError } from "../../domain/errors.ts";
import type { QueryMeta } from "../metadata.ts";
import { buildMeta, costGraphTraversal, resolutionConfidence } from "../metadata.ts";
import type { QueryLimits } from "../limits.ts";
import { checkDepthLimit, checkEdgeLimit } from "../limits.ts";

export interface ImpactAnalysisParams {
  readonly symbolId: string;
  readonly maxDepth?: number;
}

export interface ImpactAnalysisResult {
  readonly affected: readonly Symbol[];
  readonly edges: readonly Edge[];
  readonly depth: number;
  readonly meta: QueryMeta;
}

export async function impactAnalysis(
  storage: ReadStoragePort,
  params: ImpactAnalysisParams,
  limits: QueryLimits,
): Promise<Result<ImpactAnalysisResult, BrainError>> {
  // Verify the symbol exists
  const symbolResult = await storage.getSymbol(params.symbolId);
  if (!symbolResult.ok) return err(symbolResult.error);
  if (!symbolResult.value) {
    return err(brainError("SymbolNotFound", `Symbol not found: ${params.symbolId}`));
  }

  const maxDepth = params.maxDepth ?? limits.maxTraversalDepth;

  // Check depth limit
  const depthCheck = checkDepthLimit(maxDepth, limits);
  if (!depthCheck.ok) return err(depthCheck.error);

  const visited = new Set<string>();
  const allEdges: Edge[] = [];
  const allAffected: Symbol[] = [];
  let currentLevel = new Set<string>([params.symbolId]);
  let depth = 0;
  let totalResolved = 0;
  let totalEdges = 0;

  while (currentLevel.size > 0 && depth < maxDepth) {
    const nextLevel = new Set<string>();

    for (const symId of currentLevel) {
      if (visited.has(symId)) continue;
      visited.add(symId);

      const edgesResult = await storage.getIncomingEdges(symId);
      if (!edgesResult.ok) continue;

      for (const edge of edgesResult.value) {
        totalEdges++;
        allEdges.push(edge);

        if (!visited.has(edge.sourceSymbolId)) {
          nextLevel.add(edge.sourceSymbolId);

          // Resolve the source symbol
          const sourceResult = await storage.getSymbol(edge.sourceSymbolId);
          if (sourceResult.ok && sourceResult.value) {
            allAffected.push(sourceResult.value);
            totalResolved++;
          }
        }
      }
    }

    // Check edge limit
    const edgeCheck = checkEdgeLimit(allEdges.length, limits);
    if (!edgeCheck.ok) return err(edgeCheck.error);

    currentLevel = nextLevel;
    depth++;
  }

  const freshness = await storage.getFreshness();
  if (!freshness.ok) return err(freshness.error);

  const confidence = resolutionConfidence(totalResolved, totalEdges);

  return ok({
    affected: allAffected,
    edges: allEdges,
    depth,
    meta: buildMeta("estimated", confidence, freshness.value, costGraphTraversal(depth)),
  });
}