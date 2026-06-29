/**
 * Result<T, E> — discriminated union for expected failures.
 *
 * [HARD] §8.2: No try/catch for control flow. Throw only for programmer errors.
 */

import type { BrainError } from "./errors.ts";

export type Result<T, E = BrainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true as const, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false as const, error };
}

export function isResult(value: unknown): value is Result<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as Record<string, unknown>).ok === "boolean"
  );
}
