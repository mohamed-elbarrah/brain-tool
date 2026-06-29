/**
 * BrainError — typed error codes for expected failures.
 *
 * [HARD] §8.2: Result-based errors for expected failures; throw only for bugs.
 * [HARD] §8.6: LimitExceeded for resource limits (never silent truncation).
 */

export type BrainErrorCode =
  | "SymbolNotFound"
  | "BadInput"
  | "LimitExceeded"
  | "ParseError"
  | "Quarantined"
  | "Internal";

export interface BrainError {
  readonly code: BrainErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export function brainError(code: BrainErrorCode, message: string, cause?: unknown): BrainError {
  return { code, message, cause };
}
