/**
 * Query metadata — value types for result metadata.
 *
 * [HARD] §8.3–8.8: Every query result carries trust, confidence, freshness,
 * estimatedCost, and respects resource limits.
 *
 * Computation of these values lives in src/query/ (Layer 3). Only the type
 * shapes live here in Layer 0 so all layers share the same contract.
 */

export type TrustLevel = "exact" | "estimated" | "approximate";

export type EstimatedCost = "FAST" | "MEDIUM" | "EXPENSIVE";

export interface Freshness {
  readonly lastIndexed: number;
  readonly queueSize: number;
  readonly dirtyFiles: number;
  readonly indexVersion: number;
  readonly possiblyStale: boolean;
}

/**
 * Confidence is a number in [0, 1].
 * 1.0 = exact, fully resolved, fresh.
 * <1.0 = reduced by unresolved refs, staleness, or heuristic matching.
 */
export type Confidence = number;
