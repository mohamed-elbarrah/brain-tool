/**
 * searchRoutes — "Which routes match this pattern?"
 *
 * Searches indexed routes by path pattern, method, or controller.
 * Path matching is simple substring match in MVP (no glob/regex).
 */

import type { ReadStoragePort } from "../../storage/port.ts";
import type { Route } from "../../domain/route.ts";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";
import type { BrainError } from "../../domain/errors.ts";
import type { QueryMeta } from "../metadata.ts";
import { buildMeta, costFileScan } from "../metadata.ts";
import type { QueryLimits } from "../limits.ts";
import { checkSymbolLimit } from "../limits.ts";
import { sortRoutes } from "../ordering.ts";

export interface SearchRoutesParams {
  readonly pathPattern?: string;
  readonly method?: string;
  readonly controllerSymbolId?: string;
}

export interface SearchRoutesResult {
  readonly routes: readonly Route[];
  readonly meta: QueryMeta;
}

export async function searchRoutes(
  storage: ReadStoragePort,
  params: SearchRoutesParams,
  limits: QueryLimits,
): Promise<Result<SearchRoutesResult, BrainError>> {
  const allRoutesResult = await storage.getRoutes();
  if (!allRoutesResult.ok) return err(allRoutesResult.error);

  let matches = [...allRoutesResult.value];

  // Filter by path pattern (substring match)
  if (params.pathPattern) {
    const pattern = params.pathPattern.toLowerCase();
    matches = matches.filter((r) => r.path.toLowerCase().includes(pattern));
  }

  // Filter by method
  if (params.method) {
    const method = params.method.toLowerCase();
    matches = matches.filter((r) => r.method.toLowerCase() === method);
  }

  // Filter by controller
  if (params.controllerSymbolId) {
    matches = matches.filter((r) => r.controllerSymbolId === params.controllerSymbolId);
  }

  const routes = sortRoutes(matches);

  // Check limit
  const limitCheck = checkSymbolLimit(routes.length, limits);
  if (!limitCheck.ok) return err(limitCheck.error);

  const freshness = await storage.getFreshness();
  if (!freshness.ok) return err(freshness.error);

  return ok({
    routes,
    meta: buildMeta("exact", 1.0, freshness.value, costFileScan()),
  });
}