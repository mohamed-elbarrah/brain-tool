/**
 * Resource limits — configurable caps on query results.
 *
 * [HARD] §8.6: When a limit is exceeded, the query returns LimitExceeded
 * (never silent truncation). The agent can retry with narrower parameters.
 */

import type { BrainError } from "../domain/errors.ts";
import { brainError } from "../domain/errors.ts";
import type { Result } from "../domain/result.ts";
import { err, ok } from "../domain/result.ts";

/** Limits applied to every query. */
export interface QueryLimits {
  /** Maximum number of symbols returned by a single query. */
  readonly maxSymbols: number;
  /** Maximum number of references returned by a single query. */
  readonly maxReferences: number;
  /** Maximum number of edges returned by a single query. */
  readonly maxEdges: number;
  /** Maximum graph traversal depth for impact analysis. */
  readonly maxTraversalDepth: number;
  /** Maximum number of files scanned in a single query. */
  readonly maxFiles: number;
}

/** Default limits (conservative for MVP). */
export const DEFAULT_LIMITS: QueryLimits = {
  maxSymbols: 100,
  maxReferences: 200,
  maxEdges: 200,
  maxTraversalDepth: 5,
  maxFiles: 50,
};

/** Check a symbol count against the limit. */
export function checkSymbolLimit(
  count: number,
  limits: QueryLimits,
): Result<void, BrainError> {
  if (count > limits.maxSymbols) {
    return err(brainError("LimitExceeded", `Symbol limit exceeded: ${count} > ${limits.maxSymbols}`));
  }
  return ok(undefined);
}

/** Check a reference count against the limit. */
export function checkReferenceLimit(
  count: number,
  limits: QueryLimits,
): Result<void, BrainError> {
  if (count > limits.maxReferences) {
    return err(brainError("LimitExceeded", `Reference limit exceeded: ${count} > ${limits.maxReferences}`));
  }
  return ok(undefined);
}

/** Check an edge count against the limit. */
export function checkEdgeLimit(
  count: number,
  limits: QueryLimits,
): Result<void, BrainError> {
  if (count > limits.maxEdges) {
    return err(brainError("LimitExceeded", `Edge limit exceeded: ${count} > ${limits.maxEdges}`));
  }
  return ok(undefined);
}

/** Check traversal depth against the limit. */
export function checkDepthLimit(
  depth: number,
  limits: QueryLimits,
): Result<void, BrainError> {
  if (depth > limits.maxTraversalDepth) {
    return err(brainError("LimitExceeded", `Traversal depth limit exceeded: ${depth} > ${limits.maxTraversalDepth}`));
  }
  return ok(undefined);
}