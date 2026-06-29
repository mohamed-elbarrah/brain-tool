/**
 * searchComponents — "Which components use this hook/prop?"
 *
 * Searches indexed components by name, prop name, or imported component.
 * Returns matching components with their props and dependencies.
 */

import type { ReadStoragePort } from "../../storage/port.ts";
import type { Component } from "../../domain/component.ts";
import type { Result } from "../../domain/result.ts";
import { err, ok } from "../../domain/result.ts";
import type { BrainError } from "../../domain/errors.ts";
import type { QueryMeta } from "../metadata.ts";
import { buildMeta, costFileScan } from "../metadata.ts";
import type { QueryLimits } from "../limits.ts";
import { checkSymbolLimit } from "../limits.ts";
import { sortComponents } from "../ordering.ts";

export interface SearchComponentsParams {
  readonly name?: string;
  readonly propName?: string;
  readonly usesComponent?: string;
}

export interface SearchComponentsResult {
  readonly components: readonly Component[];
  readonly meta: QueryMeta;
}

export async function searchComponents(
  storage: ReadStoragePort,
  params: SearchComponentsParams,
  limits: QueryLimits,
): Promise<Result<SearchComponentsResult, BrainError>> {
  const allComponentsResult = await storage.getComponents();
  if (!allComponentsResult.ok) return err(allComponentsResult.error);

  let matches = [...allComponentsResult.value];

  // Filter by name (look up the symbol to get the name)
  if (params.name) {
    const nameLower = params.name.toLowerCase();
    const filtered: Component[] = [];
    for (const comp of matches) {
      const symResult = await storage.getSymbol(comp.symbolId);
      if (symResult.ok && symResult.value) {
        if (symResult.value.name.toLowerCase().includes(nameLower)) {
          filtered.push(comp);
        }
      }
    }
    matches = filtered;
  }

  // Filter by prop name
  if (params.propName) {
    const propLower = params.propName.toLowerCase();
    matches = matches.filter((comp) =>
      Object.keys(comp.props).some((k) => k.toLowerCase().includes(propLower)),
    );
  }

  // Filter by used component
  if (params.usesComponent) {
    const compLower = params.usesComponent.toLowerCase();
    matches = matches.filter((comp) =>
      comp.importedComponentSymbolIds.some((id) => id.toLowerCase().includes(compLower)),
    );
  }

  const components = sortComponents(matches);

  // Check limit
  const limitCheck = checkSymbolLimit(components.length, limits);
  if (!limitCheck.ok) return err(limitCheck.error);

  const freshness = await storage.getFreshness();
  if (!freshness.ok) return err(freshness.error);

  return ok({
    components,
    meta: buildMeta("exact", 1.0, freshness.value, costFileScan()),
  });
}