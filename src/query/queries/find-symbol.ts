/**
 * findSymbol — "Where is this symbol defined?"
 *
 * Looks up a symbol by name (and optionally file path). Returns all matching
 * symbols with their locations. This is the most fundamental query — it
 * answers the first MVP question.
 */

import type { ReadStoragePort } from "../../storage/port.ts";
import type { Symbol } from "../../domain/symbol.ts";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";
import type { BrainError } from "../../domain/errors.ts";
import type { QueryMeta } from "../metadata.ts";
import { buildMeta, costLookup } from "../metadata.ts";
import type { QueryLimits } from "../limits.ts";
import { checkSymbolLimit } from "../limits.ts";
import { sortSymbols } from "../ordering.ts";
import type { SymbolKind } from "../../domain/identity.ts";
import type { SymbolFilter } from "../../storage/records.ts";

export interface FindSymbolParams {
  readonly name: string;
  readonly filePath?: string;
  readonly kind?: string;
}

export interface FindSymbolResult {
  readonly symbols: readonly Symbol[];
  readonly meta: QueryMeta;
}

export async function findSymbol(
  storage: ReadStoragePort,
  params: FindSymbolParams,
  limits: QueryLimits,
): Promise<Result<FindSymbolResult, BrainError>> {
  const filter: SymbolFilter = {
    name: params.name,
    ...(params.filePath ? { filePath: params.filePath } : {}),
    ...(params.kind ? { kind: params.kind as SymbolKind } : {}),
  };

  const result = await storage.querySymbols(filter);
  if (!result.ok) return err(result.error);

  const symbols = sortSymbols([...result.value]);

  // Check limit
  const limitCheck = checkSymbolLimit(symbols.length, limits);
  if (!limitCheck.ok) return err(limitCheck.error);

  const freshness = await storage.getFreshness();
  if (!freshness.ok) return err(freshness.error);

  return ok({
    symbols,
    meta: buildMeta("exact", 1.0, freshness.value, costLookup()),
  });
}