/**
 * Query metadata — trust, confidence, freshness, estimated cost.
 *
 * [HARD] §8.3–8.5: Every query result carries these fields so the agent
 * can distinguish exact answers from inferred ones, and resource limits
 * are communicated via LimitExceeded (never silent truncation).
 */

import type { FreshnessSnapshot } from "../storage/records.ts";

/** How the result was derived. */
export type TrustLevel = "exact" | "estimated";

/** Metadata attached to every query result. */
export interface QueryMeta {
  readonly trust: TrustLevel;
  readonly confidence: number; // 0.0 – 1.0
  readonly freshness: FreshnessSnapshot;
  readonly estimatedCost: number; // relative cost units
}

/** Build query metadata for a result. */
export function buildMeta(
  trust: TrustLevel,
  confidence: number,
  freshness: FreshnessSnapshot,
  estimatedCost: number,
): QueryMeta {
  return { trust, confidence, freshness, estimatedCost };
}

/**
 * Compute confidence based on resolution ratio.
 * If 8 out of 10 references resolved, confidence = 0.8.
 */
export function resolutionConfidence(resolved: number, total: number): number {
  if (total === 0) return 1.0;
  return Math.min(1.0, resolved / total);
}

/**
 * Estimate cost for a simple lookup (single storage read).
 */
export function costLookup(): number {
  return 1;
}

/**
 * Estimate cost for a file-scoped query (reads all symbols in a file).
 */
export function costFileScan(): number {
  return 3;
}

/**
 * Estimate cost for a graph traversal (follows edges).
 * `depth` is how many levels deep the traversal goes.
 */
export function costGraphTraversal(depth: number): number {
  return 5 + depth * 3;
}

/**
 * Estimate cost for a full index scan (reads all symbols).
 */
export function costFullScan(): number {
  return 10;
}