/**
 * findDependents — "What depends on this symbol?"
 *
 * Finds all symbols that directly reference the given symbol (incoming edges).
 * This is a single-level dependency query (not transitive — that's impactAnalysis).
 */

import type { ReadStoragePort } from "../../storage/port.ts";
import type { Edge } from "../../domain/edge.ts";
import type { Symbol } from "../../domain/symbol.ts";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";
import type { BrainError } from "../../domain/errors.ts";
import { brainError } from "../../domain/errors.ts";
import type { QueryMeta } from "../metadata.ts";
import { buildMeta, costFileScan, resolutionConfidence } from "../metadata.ts";
import type { QueryLimits } from "../limits.ts";
import { checkEdgeLimit } from "../limits.ts";
import { sortEdges } from "../ordering.ts";

export interface FindDependentsParams {
  readonly symbolId: string;
}

export interface FindDependentsResult {
  readonly dependents: readonly Symbol[];
  readonly edges: readonly Edge[];
  readonly meta: QueryMeta;
}

export async function findDependents(
  storage: ReadStoragePort,
  params: FindDependentsParams,
  limits: QueryLimits,
): Promise<Result<FindDependentsResult, BrainError>> {
  // Verify the symbol exists
  const symbolResult = await storage.getSymbol(params.symbolId);
  if (!symbolResult.ok) return err(symbolResult.error);
  if (!symbolResult.value) {
    return err(brainError("SymbolNotFound", `Symbol not found: ${params.symbolId}`));
  }

  // Get incoming edges
  const edgesResult = await storage.getIncomingEdges(params.symbolId);
  if (!edgesResult.ok) return err(edgesResult.error);

  const edges = sortEdges([...edgesResult.value]);

  // Check limit
  const limitCheck = checkEdgeLimit(edges.length, limits);
  if (!limitCheck.ok) return err(limitCheck.error);

  // Resolve source symbols for each edge
  const dependents: Symbol[] = [];
  for (const edge of edges) {
    const sourceResult = await storage.getSymbol(edge.sourceSymbolId);
    if (sourceResult.ok && sourceResult.value) {
      dependents.push(sourceResult.value);
    }
  }

  const freshness = await storage.getFreshness();
  if (!freshness.ok) return err(freshness.error);

  // Confidence: how many edges resolved to actual symbols
  const resolved = edges.filter((e) => dependents.some((d) => d.symbolId === e.sourceSymbolId)).length;
  const confidence = resolutionConfidence(resolved, edges.length);

  return ok({
    dependents,
    edges,
    meta: buildMeta("estimated", confidence, freshness.value, costFileScan()),
  });
}