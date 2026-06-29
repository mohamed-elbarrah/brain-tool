/**
 * findDuplicate — "Does similar functionality already exist?"
 *
 * Finds symbols with the same or similar signature hash. This is a heuristic
 * — exact signature hash match means identical implementation. A future
 * version could use fuzzy matching (e.g., AST structure similarity).
 *
 * In MVP, this returns exact signature hash matches only.
 */

import type { ReadStoragePort } from "../../storage/port.ts";
import type { Symbol } from "../../domain/symbol.ts";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";
import type { BrainError } from "../../domain/errors.ts";
import type { QueryMeta } from "../metadata.ts";
import { buildMeta, costFullScan } from "../metadata.ts";
import type { QueryLimits } from "../limits.ts";
import { checkSymbolLimit } from "../limits.ts";
import { sortSymbols } from "../ordering.ts";

export interface FindDuplicateParams {
  readonly signatureHash: string;
  readonly excludeSymbolId?: string;
}

export interface FindDuplicateResult {
  readonly duplicates: readonly Symbol[];
  readonly meta: QueryMeta;
}

export async function findDuplicate(
  storage: ReadStoragePort,
  params: FindDuplicateParams,
  limits: QueryLimits,
): Promise<Result<FindDuplicateResult, BrainError>> {
  // Query all symbols (we need to scan for matching signatureHash)
  const allSymbolsResult = await storage.querySymbols({});
  if (!allSymbolsResult.ok) return err(allSymbolsResult.error);

  const matches = allSymbolsResult.value.filter((s) => {
    if (s.signatureHash !== params.signatureHash) return false;
    if (params.excludeSymbolId && s.symbolId === params.excludeSymbolId) return false;
    return true;
  });

  const duplicates = sortSymbols([...matches]);

  // Check limit
  const limitCheck = checkSymbolLimit(duplicates.length, limits);
  if (!limitCheck.ok) return err(limitCheck.error);

  const freshness = await storage.getFreshness();
  if (!freshness.ok) return err(freshness.error);

  // Confidence: exact hash match = high confidence
  const confidence = duplicates.length > 0 ? 0.95 : 1.0;

  return ok({
    duplicates,
    meta: buildMeta("exact", confidence, freshness.value, costFullScan()),
  });
}